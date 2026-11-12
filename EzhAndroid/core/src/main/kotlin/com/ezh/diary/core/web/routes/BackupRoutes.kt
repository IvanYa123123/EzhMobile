package com.ezh.diary.core.web.routes

import com.ezh.diary.core.web.ApiDeps
import com.ezh.diary.core.web.Validation
import com.ezh.diary.core.web.enforceRate
import com.ezh.diary.core.web.respondError
import com.ezh.diary.core.web.respondJson
import com.ezh.diary.core.web.receiveJsonElement
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

private const val BACKUP_APP_ID = "EZHednevnik"
private const val BACKUP_FORMAT = 1
private const val BACKUP_MAX_ROWS = 20_000
private const val BACKUP_MAX_TEXT = 4_000

/** Порядок таблиц и колонок как в routes_backup.py — старые бэкапы остаются совместимыми. */
private val BACKUP_TABLES: List<Pair<String, List<String>>> = listOf(
    "tasks" to listOf("id", "date", "text", "status"),
    "friends" to listOf("id", "name", "group_name", "subgroup"),
    "lab_progress" to listOf("group_name", "subject", "completed", "total"),
    "lab_items" to listOf("id", "group_name", "subject", "idx", "title", "completed"),
    "subject_settings" to listOf("subject", "custom_name", "link", "teacher", "location"),
    "custom_schedule" to listOf(
        "id", "group_name", "base_date", "time_range", "lesson", "type_name",
        "teacher", "location", "is_event", "recurrence", "exceptions",
    ),
    "tracked_teachers" to listOf("id", "name", "slug"),
)

private val BACKUP_INT_COLS = setOf("id", "idx", "completed", "total", "is_event")

fun Route.backupRoutes(deps: ApiDeps) {
    get("/api/backup") {
        if (!call.enforceRate(deps, "backup", 15)) return@get
        val tables = LinkedHashMap<String, JsonElement>()
        for ((table, columns) in BACKUP_TABLES) {
            tables[table] = dumpTable(deps, table, columns)
        }
        call.respondJson(JsonObject(linkedMapOf(
            "app" to JsonPrimitive(BACKUP_APP_ID),
            "version" to JsonPrimitive(deps.version),
            "format" to JsonPrimitive(BACKUP_FORMAT),
            "exported_at" to JsonPrimitive(deps.clock() / 1000),
            "custom_groups" to JsonArray(deps.customGroups.load().map { JsonPrimitive(it) }),
            "tables" to JsonObject(tables),
        )))
    }

    post("/api/backup") {
        if (!call.enforceRate(deps, "backup", 15)) return@post
        val root = call.receiveJsonElement() as? JsonObject
            ?: return@post call.respondJson(
                errorJson("invalid json"),
                HttpStatusCode.BadRequest,
            )
        val tablesElement = root["tables"]
        val tables = if (tablesElement is JsonObject) tablesElement else root

        // Сначала проверяем форму, чтобы не начинать транзакцию зря.
        for ((table, _) in BACKUP_TABLES) {
            val rows = tables[table] ?: continue
            if (rows !is JsonArray) {
                return@post call.respondJson(
                    errorJson("$table: expected list"),
                    HttpStatusCode.BadRequest,
                )
            }
        }

        val restored = LinkedHashMap<String, JsonElement>()
        try {
            deps.db.transaction {
                for ((table, columns) in BACKUP_TABLES) {
                    val rows = tables[table] ?: continue
                    val list = rows as JsonArray
                    update("DELETE FROM $table")
                    val insertSql = "INSERT OR REPLACE INTO $table " +
                        "(${columns.joinToString(", ")}) VALUES (${columns.joinToString(", ") { "?" }})"
                    for (rowElement in list) {
                        val rowsObj = rowElement as? JsonObject ?: continue
                        insert(insertSql, columns.map { coerce(it, rowsObj[it]) })
                    }
                    restored[table] = JsonPrimitive(list.size)
                }
            }
        } catch (e: Exception) {
            return@post call.respondJson(
                errorJson(e.message ?: "restore failed"),
                HttpStatusCode.InternalServerError,
            )
        }

        val rawGroups = root["custom_groups"] as? JsonArray
        val groups = deps.customGroups.load().toMutableList()
        var added = 0
        var skipped = 0
        rawGroups?.take(500)?.forEach { element ->
            val raw = (element as? JsonPrimitive)?.content?.trim().orEmpty()
            val name = try {
                Validation.group(raw)
            } catch (e: IllegalArgumentException) {
                null
            }
            when {
                name == null -> skipped++
                name in groups -> skipped++
                else -> {
                    groups += name
                    added++
                }
            }
        }
        if (!deps.customGroups.save(groups)) {
            return@post call.respondJson(
                JsonObject(linkedMapOf(
                    "success" to JsonPrimitive(false),
                    "error" to JsonPrimitive("custom_groups save failed"),
                    "restored" to JsonObject(LinkedHashMap(restored)),
                )),
                HttpStatusCode.InternalServerError,
            )
        }
        restored["custom_groups"] = JsonPrimitive(added)
        restored["custom_groups_skipped"] = JsonPrimitive(skipped)
        call.respondJson(JsonObject(linkedMapOf(
            "success" to JsonPrimitive(true),
            "restored" to JsonObject(LinkedHashMap(restored)),
        )))
    }
}

private fun dumpTable(deps: ApiDeps, table: String, columns: List<String>): JsonArray {
    val rows = deps.db.transaction {
        query("SELECT ${columns.joinToString(", ")} FROM $table").map { row ->
            JsonObject(columns.associateWith { column ->
                val value = row[column]
                if (column in BACKUP_INT_COLS) {
                    (value as? Number)?.toInt()?.let { JsonPrimitive(it) } ?: JsonNull
                } else {
                    value?.let { JsonPrimitive(it.toString()) } ?: JsonNull
                }
            })
        }
    }
    return JsonArray(rows)
}

/** _coerce: int-колонки -> число (мусор -> 0), текст -> строка (None -> ""), обрезка 4000. */
private fun coerce(column: String, element: JsonElement?): Any? =
    if (column in BACKUP_INT_COLS) intValue(element) else textValue(element)

private fun intValue(element: JsonElement?): Int {
    if (element == null || element is JsonNull) return 0
    val primitive = element as? JsonPrimitive ?: return 0
    primitive.booleanOrNull?.let { return if (it) 1 else 0 }
    if (primitive.isString) return primitive.content.trim().toIntOrNull() ?: 0
    primitive.intOrNull?.let { return it }
    primitive.doubleOrNull?.let { return it.toInt() }
    return 0
}

private fun textValue(element: JsonElement?): String = when (element) {
    null, is JsonNull -> ""
    is JsonPrimitive -> element.content.take(BACKUP_MAX_TEXT)
    else -> element.toString().take(BACKUP_MAX_TEXT)
}

private fun errorJson(message: String) = JsonObject(linkedMapOf(
    "success" to JsonPrimitive(false),
    "error" to JsonPrimitive(message),
))
