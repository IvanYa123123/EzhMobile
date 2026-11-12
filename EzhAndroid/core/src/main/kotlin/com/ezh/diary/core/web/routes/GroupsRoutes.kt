package com.ezh.diary.core.web.routes

import com.ezh.diary.core.web.ApiDeps
import com.ezh.diary.core.web.Validation
import com.ezh.diary.core.web.enforceRate
import com.ezh.diary.core.web.receiveJsonObject
import com.ezh.diary.core.web.respondError
import com.ezh.diary.core.web.respondJson
import com.ezh.diary.core.web.strOf
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Порт routes_groups.py (кроме `/`, который отдаёт staticRoutes).
 *
 * Список берётся из Group.txt (в APK — assets), при пустоте — с сайта;
 * пользовательские группы добавляются в конец, дубликаты не появляются.
 */
fun Route.groupsRoutes(deps: ApiDeps) {
    get("/api/groups") {
        if (!call.enforceRate(deps, "groups", 60)) return@get

        val groups = deps.bundles.text("Group.txt")
            ?.lineSequence()
            ?.map { it.trim() }
            ?.filter { it.isNotEmpty() }
            ?.toMutableList()
            ?: mutableListOf()
        if (groups.isEmpty()) {
            groups.addAll(deps.groupsApi?.groups().orEmpty())
        }

        val seen = groups.toHashSet()
        for (name in deps.customGroups.load()) {
            if (seen.add(name)) groups.add(name)
        }

        call.respondJson(
            buildJsonArray { groups.forEach { add(JsonPrimitive(it)) } },
            cacheControl = "public, max-age=3600",
        )
    }

    post("/api/groups/custom") {
        if (!call.enforceRate(deps, "groups_custom", 30)) return@post
        val body = call.receiveJsonObject()
        val raw = strOf(body["name"])
        if (raw.isEmpty()) {
            call.respondError(HttpStatusCode.BadRequest, "empty")
            return@post
        }
        val name = try {
            Validation.group(raw)
        } catch (e: IllegalArgumentException) {
            call.respondError(HttpStatusCode.BadRequest, e.message ?: "invalid group format")
            return@post
        }
        val groups = deps.customGroups.load().toMutableList()
        if (name in groups) {
            call.respondJson(buildJsonObject {
                put("success", JsonPrimitive(true))
                put("already", JsonPrimitive(true))
            })
            return@post
        }
        groups.add(name)
        if (!deps.customGroups.save(groups)) {
            call.respondError(HttpStatusCode.InternalServerError, "save failed")
            return@post
        }
        call.respondJson(buildJsonObject { put("success", JsonPrimitive(true)) })
    }
}
