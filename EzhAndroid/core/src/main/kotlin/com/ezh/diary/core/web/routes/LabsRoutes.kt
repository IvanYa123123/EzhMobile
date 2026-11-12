package com.ezh.diary.core.web.routes

import com.ezh.diary.core.db.LabItem
import com.ezh.diary.core.web.ApiDeps
import com.ezh.diary.core.web.enforceRate
import com.ezh.diary.core.web.intOf
import com.ezh.diary.core.web.jsonObj
import com.ezh.diary.core.web.receiveJsonElement
import com.ezh.diary.core.web.receiveJsonObject
import com.ezh.diary.core.web.respondError
import com.ezh.diary.core.web.respondJson
import com.ezh.diary.core.web.strOf
import com.ezh.diary.core.web.text
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Лабораторные: прогресс по предметам + список работ с отметками.
 * Порт routes_labs.py: те же поля, коды и пересчёт lab_progress.
 */
fun Route.labsRoutes(deps: ApiDeps) {
    get("/api/labs") {
        if (!call.enforceRate(deps, "labs", 120)) return@get
        val group = strOf(call.request.queryParameters["group"]?.let { JsonPrimitive(it) })
        if (group.isEmpty()) return@get call.respondJson(JsonObject(emptyMap()))
        call.respondJson(JsonObject(
            deps.labs.progress(group).mapValues { (_, v) ->
                jsonObj(
                    "completed" to JsonPrimitive(v.completed),
                    "total" to JsonPrimitive(v.total),
                )
            },
        ))
    }

    post("/api/labs") {
        if (!call.enforceRate(deps, "labs", 120)) return@post
        val body = call.receiveJsonElement()
        val items: List<JsonElement> = when (body) {
            null, is JsonNull -> emptyList()
            is JsonArray -> body.toList()
            else -> listOf(body)
        }
        for (element in items) {
            val item = element as? JsonObject ?: continue
            val group = item.text("group")
            val subject = item.text("subject")
            if (group.isEmpty() || subject.isEmpty()) continue
            var completed = maxOf(0, intOf(item["completed"], 0))
            var total = maxOf(0, intOf(item["total"], 0))
            if (completed > total) completed = total
            deps.labs.saveProgress(group, subject, completed, total)
        }
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }

    get("/api/lab_items") {
        if (!call.enforceRate(deps, "lab_items", 240)) return@get
        val group = strOf(call.request.queryParameters["group"]?.let { JsonPrimitive(it) })
        if (group.isEmpty()) return@get call.respondJson(JsonObject(emptyMap()))
        val grouped = LinkedHashMap<String, MutableList<JsonObject>>()
        for (item in deps.labs.items(group)) {
            grouped.getOrPut(item.subject) { mutableListOf() } += item.toJson()
        }
        call.respondJson(JsonObject(grouped.mapValues { JsonArray(it.value) }))
    }

    post("/api/lab_items/sync") {
        if (!call.enforceRate(deps, "lab_items_sync", 120)) return@post
        val data = call.receiveJsonObject()
        val group = data.text("group")
        val specs = data["items"] as? JsonArray
        if (group.isEmpty() || specs == null) {
            return@post call.respondError(HttpStatusCode.BadRequest, "required")
        }
        val touched = linkedSetOf<String>()
        for (element in specs) {
            val spec = element as? JsonObject ?: continue
            val subject = spec.text("subject")
            val count = intOf(spec["count"], 0)
            if (subject.isEmpty() || count <= 0 || count > 200) continue
            touched += subject
            val existing = deps.labs.items(group, subject).map { it.idx }.toSet()
            val short = shortSubject(subject)
            for (i in 1..count) {
                if (i !in existing) {
                    deps.labs.insertIgnore(group, subject, i, "$short$i")
                }
            }
        }
        for (subject in touched) deps.labs.recalc(group, subject)
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }

    post("/api/lab_items/add") {
        if (!call.enforceRate(deps, "lab_items_add", 120)) return@post
        val data = call.receiveJsonObject()
        val group = data.text("group")
        val subject = data.text("subject")
        if (group.isEmpty() || subject.isEmpty()) {
            return@post call.respondError(HttpStatusCode.BadRequest, "required")
        }
        val nextIdx = (deps.labs.items(group, subject).maxOfOrNull { it.idx } ?: 0) + 1
        deps.labs.insertIgnore(group, subject, nextIdx, "${shortSubject(subject)}$nextIdx")
        deps.labs.recalc(group, subject)
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }

    post("/api/lab_items/remove_last") {
        if (!call.enforceRate(deps, "lab_items_remove_last", 120)) return@post
        val data = call.receiveJsonObject()
        val group = data.text("group")
        val subject = data.text("subject")
        val removed = deps.labs.removeLast(group, subject)
            ?: return@post call.respondJson(
                jsonObj("success" to JsonPrimitive(false)),
                HttpStatusCode.NotFound,
            )
        deps.labs.recalc(group, subject)
        call.respondJson(jsonObj("success" to JsonPrimitive(true), "idx" to JsonPrimitive(removed)))
    }

    put("/api/lab_items/{id}") {
        if (!call.enforceRate(deps, "lab_item", 240)) return@put
        val id = call.parameters["id"]?.toIntOrNull()
            ?: return@put call.respondError(HttpStatusCode.NotFound, "not found")
        val data = call.receiveJsonObject()
        val item = deps.labs.get(id)
            ?: return@put call.respondError(HttpStatusCode.NotFound, "not found")
        val rawTitle = data["title"]
        val newTitle = if (rawTitle == null || rawTitle is JsonNull) {
            item.title
        } else {
            strOf(rawTitle).take(200).ifEmpty { item.title }
        }
        val rawCompleted = data["completed"]
        val newCompleted = if (rawCompleted == null || rawCompleted is JsonNull) {
            item.completed
        } else {
            intOf(rawCompleted, 0) != 0
        }
        deps.labs.setTitle(id, newTitle)
        deps.labs.setCompleted(id, newCompleted)
        deps.labs.recalc(item.groupName, item.subject)
        call.respondJson(jsonObj(
            "success" to JsonPrimitive(true),
            "title" to JsonPrimitive(newTitle),
            "completed" to JsonPrimitive(if (newCompleted) 1 else 0),
        ))
    }

    delete("/api/lab_items/{id}") {
        if (!call.enforceRate(deps, "lab_item", 240)) return@delete
        val id = call.parameters["id"]?.toIntOrNull()
            ?: return@delete call.respondError(HttpStatusCode.NotFound, "not found")
        val item = deps.labs.get(id)
        if (item != null) {
            deps.labs.delete(id)
            deps.labs.recalc(item.groupName, item.subject)
        }
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }
}

private fun shortSubject(subject: String): String {
    val open = subject.lastIndexOf('(')
    val close = subject.lastIndexOf(')')
    return if (open >= 0 && close > open) subject.substring(open + 1, close).trim() else subject
}

private fun LabItem.toJson() = jsonObj(
    "id" to JsonPrimitive(id),
    "idx" to JsonPrimitive(idx),
    "title" to JsonPrimitive(title),
    "completed" to JsonPrimitive(if (completed) 1 else 0),
)
