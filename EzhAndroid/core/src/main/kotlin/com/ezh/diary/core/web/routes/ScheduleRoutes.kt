package com.ezh.diary.core.web.routes

import com.ezh.diary.core.web.ApiDeps
import com.ezh.diary.core.web.Ics
import com.ezh.diary.core.web.TEXT_CALENDAR_UTF8
import com.ezh.diary.core.web.TEXT_PLAIN_UTF8
import com.ezh.diary.core.web.Validation
import com.ezh.diary.core.web.enforceRate
import com.ezh.diary.core.web.jsonObj
import com.ezh.diary.core.web.respondBody
import com.ezh.diary.core.web.respondError
import com.ezh.diary.core.web.respondJson
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.response.header
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import com.ezh.diary.core.storage.readJsonElement

fun Route.scheduleRoutes(deps: ApiDeps) {
    get("/api/schedule_all") {
        if (!call.enforceRate(deps, "schedule_all", 240)) return@get
        val group = parseGroupOrNull(call) ?: return@get call.respondJson(JsonArray(emptyList()))
        val subgroup = Validation.subgroup(call.request.queryParameters["subgroup"])
        val cacheFile = deps.files.scheduleCacheFile(group, subgroup)
        val cached = deps.scheduleCache.read(cacheFile)
        if (cached != null) return@get call.respondJson(JsonArray(cached))

        val result = try {
            deps.planner.semester(group, subgroup)
        } catch (e: Exception) {
            deps.log("[schedule_all] ${e.message}")
            return@get call.respondJson(JsonArray(emptyList()))
        }
        if (result.schedule.isNotEmpty()) {
            deps.scheduleCache.save(cacheFile, result.schedule)
            if (!result.exhausted) deps.syncTimes.markSynced("${group}_$subgroup")
        }
        call.respondSchedule(JsonArray(result.schedule), result.exhausted)
    }

    get("/api/schedule_sync") {
        if (!call.enforceRate(deps, "schedule_sync", 120)) return@get
        val group = parseGroupOrNull(call) ?: return@get call.respondJson(JsonArray(emptyList()))
        val subgroup = Validation.subgroup(call.request.queryParameters["subgroup"])
        val force = call.request.queryParameters["force"] == "1"
        val syncKey = "${group}_$subgroup"
        if (!force && !deps.syncTimes.needsSync(syncKey)) {
            return@get call.respondJson(JsonArray(emptyList()))
        }
        val cacheFile = deps.files.scheduleCacheFile(group, subgroup)
        val cached = deps.scheduleCache.read(cacheFile)
        val result = try {
            deps.planner.semester(group, subgroup)
        } catch (e: Exception) {
            deps.log("[schedule_sync] ${e.message}")
            return@get call.respondJson(JsonArray(cached.orEmpty()))
        }
        if (result.schedule.isEmpty()) {
            return@get call.respondJson(JsonArray(cached.orEmpty()))
        }
        deps.scheduleCache.save(cacheFile, result.schedule)
        if (!result.exhausted) deps.syncTimes.markSynced(syncKey)
        call.respondSchedule(JsonArray(result.schedule), result.exhausted)
    }

    // Когда последний раз обновлялись расписание группы и расписания преподавателей
    // (в секундах, как time.time() в Python-версии). Нужно для экрана настроек.
    get("/api/sync_info") {
        if (!call.enforceRate(deps, "sync_info", 120)) return@get
        val group = parseGroupOrNull(call)
        val subgroup = Validation.subgroup(call.request.queryParameters["subgroup"])
        val cacheFile = group?.let { deps.files.scheduleCacheFile(it, subgroup) }
        val scheduleTs = cacheFile?.takeIf { it.exists() }?.lastModified()
            ?.takeIf { it > 0 }?.div(1000L)
        val teachersTs = teachersUpdatedAt(deps)
        call.respondJson(
            jsonObj(
                "schedule_updated_at" to (scheduleTs?.let { JsonPrimitive(it) } ?: JsonNull),
                "teachers_updated_at" to (teachersTs?.let { JsonPrimitive(it) } ?: JsonNull),
            ),
        )
    }

    get("/api/schedule.ics") {
        if (!call.enforceRate(deps, "schedule_ics", 30)) return@get
        val group = try {
            Validation.group(call.request.queryParameters["group"])
        } catch (e: IllegalArgumentException) {
            return@get call.respondError(HttpStatusCode.BadRequest, "invalid group")
        }
        val subgroup = Validation.subgroup(call.request.queryParameters["subgroup"])
        val cacheFile = deps.files.scheduleCacheFile(group, subgroup)
        if (!cacheFile.exists()) {
            return@get call.respondBody(
                "Расписание ещё не загружено. Откройте группу в календаре, затем скачивайте .ics.",
                TEXT_PLAIN_UTF8,
                HttpStatusCode.Conflict,
            )
        }
        val schedule = deps.scheduleCache.read(cacheFile)
            ?: return@get call.respondBody(
                "Ошибка чтения кэша",
                TEXT_PLAIN_UTF8,
                HttpStatusCode.InternalServerError,
            )
        call.respondBody(
            Ics.scheduleIcs(group, subgroup, schedule, Ics.utcStampAt(deps.clock())),
            TEXT_CALENDAR_UTF8,
            extraHeaders = mapOf("Content-Disposition" to Ics.attachmentsHeader(group, subgroup)),
        )
    }
}

/** Свежесть расписаний преподавателей: самый новый .ics, иначе teachers.json. */
private fun teachersUpdatedAt(deps: ApiDeps): Long? {
    val dir = deps.files.teacherSchedulesDir
    val newest = dir.listFiles { f -> f.isFile && f.extension == "ics" }
        ?.maxOfOrNull { it.lastModified() } ?: 0L
    if (newest > 0) return newest / 1000L
    val root = readJsonElement(deps.files.teachersFile) as? JsonObject ?: return null
    return (root["updated_at"] as? JsonPrimitive)?.doubleOrNull?.toLong()
}

private fun parseGroupOrNull(call: ApplicationCall): String? = try {
    Validation.group(call.request.queryParameters["group"])
} catch (e: IllegalArgumentException) {
    null
}

private suspend fun ApplicationCall.respondSchedule(body: JsonElement, exhausted: Boolean) {
    if (exhausted) response.header("X-Schedule-Exhausted", "1")
    respondJson(body)
}
