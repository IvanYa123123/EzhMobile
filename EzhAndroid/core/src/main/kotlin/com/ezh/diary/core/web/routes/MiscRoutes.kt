package com.ezh.diary.core.web.routes

import com.ezh.diary.core.db.CustomLesson
import com.ezh.diary.core.db.Friend
import com.ezh.diary.core.db.Task
import com.ezh.diary.core.web.ApiDeps
import com.ezh.diary.core.web.Validation
import com.ezh.diary.core.web.enforceRate
import com.ezh.diary.core.web.intOf
import com.ezh.diary.core.web.jsonObj
import com.ezh.diary.core.web.receiveJsonObject
import com.ezh.diary.core.web.respondError
import com.ezh.diary.core.web.respondJson
import com.ezh.diary.core.web.text
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

fun Route.miscRoutes(deps: ApiDeps) {
    get("/api/search") {
        if (!call.enforceRate(deps, "search", 240)) return@get
        var q = (call.request.queryParameters["q"] ?: "").trim()
        if (q.length < 2) {
            return@get call.respondJson(jsonObj(
                "tasks" to JsonArray(emptyList()),
                "events" to JsonArray(emptyList()),
                "count" to JsonPrimitive(0),
            ))
        }
        if (q.length > 100) q = q.take(100)
        val like = "%$q%"
        val tasks = deps.tasks.search(like)
        val events = deps.customSchedule.search(like)
        call.respondJson(jsonObj(
            "tasks" to JsonArray(tasks.map { it.toSearchJson() }),
            "events" to JsonArray(events.map { it.toSearchJson() }),
            "count" to JsonPrimitive(tasks.size + events.size),
        ))
    }

    get("/api/friends") {
        if (!call.enforceRate(deps, "friends", 120)) return@get
        call.respondJson(JsonArray(deps.friends.list().map { it.toJson() }))
    }

    post("/api/friends") {
        if (!call.enforceRate(deps, "friends", 120)) return@post
        val data = call.receiveJsonObject()
        val name = data.text("name")
        val groupRaw = data.text("group")
        val subgroup = Validation.subgroup(data.text("subgroup", "0"))
        if (name.isEmpty() || groupRaw.isEmpty()) {
            return@post call.respondError(HttpStatusCode.BadRequest, "name and group required")
        }
        if (name.length > 100) {
            return@post call.respondError(HttpStatusCode.BadRequest, "field too long")
        }
        val group = try {
            Validation.group(groupRaw)
        } catch (e: IllegalArgumentException) {
            return@post call.respondError(HttpStatusCode.BadRequest, e.message ?: "invalid group")
        }
        call.respondJson(jsonObj("id" to JsonPrimitive(deps.friends.insert(name, group, subgroup))))
    }

    put("/api/friends/{id}") {
        if (!call.enforceRate(deps, "friends", 120)) return@put
        val id = call.parameters["id"]?.toIntOrNull()
            ?: return@put call.respondError(HttpStatusCode.NotFound, "not found")
        val data = call.receiveJsonObject()
        val name = data.text("name")
        val groupRaw = data.text("group")
        val subgroup = Validation.subgroup(data.text("subgroup", "0"))
        if (name.isEmpty() || groupRaw.isEmpty()) {
            return@put call.respondError(HttpStatusCode.BadRequest, "name and group required")
        }
        if (name.length > 100) {
            return@put call.respondError(HttpStatusCode.BadRequest, "field too long")
        }
        val group = try {
            Validation.group(groupRaw)
        } catch (e: IllegalArgumentException) {
            return@put call.respondError(HttpStatusCode.BadRequest, e.message ?: "invalid group")
        }
        deps.friends.update(id, name, group, subgroup)
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }

    delete("/api/friends/{id}") {
        if (!call.enforceRate(deps, "friends", 120)) return@delete
        val id = call.parameters["id"]?.toIntOrNull()
            ?: return@delete call.respondError(HttpStatusCode.NotFound, "not found")
        deps.friends.delete(id)
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }

    get("/api/subjects") {
        if (!call.enforceRate(deps, "subjects", 120)) return@get
        call.respondJson(
            JsonObject(deps.subjects.list().associate { s ->
                s.subject to jsonObj(
                    "custom_name" to JsonPrimitive(s.customName),
                    "link" to JsonPrimitive(s.link),
                    "teacher" to JsonPrimitive(s.teacher),
                    "location" to JsonPrimitive(s.location),
                )
            }),
            cacheControl = "private, max-age=300",
        )
    }

    post("/api/subjects") {
        if (!call.enforceRate(deps, "subjects", 120)) return@post
        val data = call.receiveJsonObject()
        val subject = data.text("subject")
        if (subject.isEmpty()) {
            return@post call.respondError(HttpStatusCode.BadRequest, "subject required")
        }
        if (subject.length > 200) {
            return@post call.respondError(HttpStatusCode.BadRequest, "subject too long")
        }
        val link = Validation.link(data.text("link"))
        deps.subjects.upsert(
            subject,
            data.text("custom_name"),
            link,
            data.text("teacher"),
            data.text("location"),
        )
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }

    get("/api/custom_schedule") {
        if (!call.enforceRate(deps, "custom_schedule", 120)) return@get
        val group = (call.request.queryParameters["group"] ?: "").trim()
        if (group.isEmpty()) return@get call.respondJson(JsonArray(emptyList()))
        call.respondJson(JsonArray(deps.customSchedule.byGroup(group).map { it.toJson() }))
    }

    post("/api/custom_schedule") {
        if (!call.enforceRate(deps, "custom_schedule", 120)) return@post
        val data = call.receiveJsonObject()
        val groupRaw = data.text("group")
        val lesson = data.text("lesson")
        if (groupRaw.isEmpty() || lesson.isEmpty()) {
            return@post call.respondError(HttpStatusCode.BadRequest, "required")
        }
        if (lesson.length > 200) {
            return@post call.respondError(HttpStatusCode.BadRequest, "lesson too long")
        }
        val group = try {
            Validation.group(groupRaw)
        } catch (e: IllegalArgumentException) {
            return@post call.respondError(HttpStatusCode.BadRequest, e.message ?: "invalid group")
        }
        val baseDate = Validation.baseDate(data.text("base_date"))
            ?: return@post call.respondError(HttpStatusCode.BadRequest, "invalid base_date")
        val timeRange = Validation.timeRange(data.text("time_range"))
            ?: return@post call.respondError(HttpStatusCode.BadRequest, "invalid time_range")
        val id = deps.customSchedule.insert(
            group, baseDate, timeRange, lesson,
            data.text("type_name"), data.text("teacher"), data.text("location"),
            intOf(data["is_event"], 0) != 0,
            data.text("recurrence").ifEmpty { "none" },
            data.text("exceptions").ifEmpty { "[]" },
        )
        call.respondJson(jsonObj("id" to JsonPrimitive(id)))
    }

    put("/api/custom_schedule/{id}") {
        if (!call.enforceRate(deps, "custom_schedule", 120)) return@put
        val id = call.parameters["id"]?.toIntOrNull()
            ?: return@put call.respondError(HttpStatusCode.NotFound, "not found")
        val data = call.receiveJsonObject()
        val lesson = data.text("lesson")
        if (lesson.isEmpty()) {
            return@put call.respondError(HttpStatusCode.BadRequest, "lesson required")
        }
        if (lesson.length > 200) {
            return@put call.respondError(HttpStatusCode.BadRequest, "lesson too long")
        }
        val baseDate = Validation.baseDate(data.text("base_date"))
            ?: return@put call.respondError(HttpStatusCode.BadRequest, "invalid base_date")
        val timeRange = Validation.timeRange(data.text("time_range"))
            ?: return@put call.respondError(HttpStatusCode.BadRequest, "invalid time_range")
        deps.customSchedule.updateContent(
            id, baseDate, timeRange, lesson,
            data.text("type_name"), data.text("teacher"), data.text("location"),
            intOf(data["is_event"], 0) != 0,
            data.text("recurrence").ifEmpty { "none" },
            data.text("exceptions").ifEmpty { "[]" },
        )
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }

    delete("/api/custom_schedule/{id}") {
        if (!call.enforceRate(deps, "custom_schedule", 120)) return@delete
        val id = call.parameters["id"]?.toIntOrNull()
            ?: return@delete call.respondError(HttpStatusCode.NotFound, "not found")
        deps.customSchedule.delete(id)
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }
}

private fun Friend.toJson() = jsonObj(
    "id" to JsonPrimitive(id),
    "name" to JsonPrimitive(name),
    "group" to JsonPrimitive(groupName),
    "subgroup" to JsonPrimitive(subgroup),
)

private fun Task.toSearchJson() = jsonObj(
    "id" to JsonPrimitive(id),
    "date" to JsonPrimitive(date),
    "text" to JsonPrimitive(text),
    "status" to JsonPrimitive(status),
)

private fun CustomLesson.toSearchJson() = jsonObj(
    "id" to JsonPrimitive(id),
    "base_date" to JsonPrimitive(baseDate),
    "time_range" to JsonPrimitive(timeRange),
    "lesson" to JsonPrimitive(lesson),
    "type_name" to JsonPrimitive(typeName),
    "teacher" to JsonPrimitive(teacher),
    "location" to JsonPrimitive(location),
    "is_event" to JsonPrimitive(if (isEvent) 1 else 0),
    "recurrence" to JsonPrimitive(recurrence),
)

fun CustomLesson.toJson() = jsonObj(
    "id" to JsonPrimitive(id),
    "base_date" to JsonPrimitive(baseDate),
    "time_range" to JsonPrimitive(timeRange),
    "lesson" to JsonPrimitive(lesson),
    "type_name" to JsonPrimitive(typeName),
    "teacher" to JsonPrimitive(teacher),
    "location" to JsonPrimitive(location),
    "is_event" to JsonPrimitive(if (isEvent) 1 else 0),
    "recurrence" to JsonPrimitive(recurrence),
    "exceptions" to JsonPrimitive(exceptions.ifEmpty { "[]" }),
)
