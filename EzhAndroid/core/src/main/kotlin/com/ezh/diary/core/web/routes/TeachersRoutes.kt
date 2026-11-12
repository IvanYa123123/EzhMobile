package com.ezh.diary.core.web.routes

import com.ezh.diary.core.db.TrackedTeacher
import com.ezh.diary.core.teacher.Teacher
import com.ezh.diary.core.teacher.TeacherLesson
import com.ezh.diary.core.web.ApiDeps
import com.ezh.diary.core.web.enforceRate
import com.ezh.diary.core.web.jsonObj
import com.ezh.diary.core.web.receiveJsonObject
import com.ezh.diary.core.web.respondError
import com.ezh.diary.core.web.respondJson
import com.ezh.diary.core.web.strOf
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

fun Route.teachersRoutes(deps: ApiDeps) {
    get("/api/teachers") {
        if (!call.enforceRate(deps, "teachers", 60)) return@get
        val force = call.request.queryParameters["force"] == "1"
        val items = try {
            deps.teacherService.teachers(force)
        } catch (e: Exception) {
            deps.log("[teachers] ${e.message}")
            emptyList<Teacher>()
        }
        call.respondJson(
            JsonArray(items.map { it.toJson() }),
            cacheControl = "public, max-age=3600",
        )
    }

    get("/api/teacher_schedule") {
        if (!call.enforceRate(deps, "teacher_schedule", 60)) return@get
        val slug = call.request.queryParameters["slug"].orEmpty()
        if (slug.isBlank()) return@get call.respondJson(JsonArray(emptyList()))
        val force = call.request.queryParameters["force"] == "1"
        val lessons = try {
            deps.teacherService.schedule(slug, force)
        } catch (e: Exception) {
            deps.log("[teacher_schedule] ${e.message}")
            emptyList<TeacherLesson>()
        }
        call.respondJson(JsonArray(lessons.map { it.toJson() }))
    }

    get("/api/tracked_teachers") {
        if (!call.enforceRate(deps, "tracked_teachers", 120)) return@get
        call.respondJson(JsonArray(deps.trackedTeachers.list().map { it.toJson() }))
    }

    post("/api/tracked_teachers") {
        if (!call.enforceRate(deps, "tracked_teachers", 120)) return@post
        val data = call.receiveJsonObject()
        val name = strOf(data["name"])
        val slug = strOf(data["slug"]).lowercase()
        if (name.isEmpty() || slug.isEmpty()) {
            return@post call.respondError(HttpStatusCode.BadRequest, "invalid data")
        }
        if (name.length > 200 || slug.length > 100) {
            return@post call.respondError(HttpStatusCode.BadRequest, "field too long")
        }

        val newId = deps.trackedTeachers.insert(name, slug)
        val row = deps.trackedTeachers.findBySlug(slug)
            ?: return@post call.respondError(HttpStatusCode.InternalServerError, "insert failed")
        call.respondJson(jsonObj(
            "id" to JsonPrimitive(row.id),
            "name" to JsonPrimitive(row.name),
            "slug" to JsonPrimitive(row.slug),
            "already" to JsonPrimitive(newId == null),
        ))
    }

    delete("/api/tracked_teachers/{id}") {
        if (!call.enforceRate(deps, "tracked_teachers", 120)) return@delete
        call.parameters["id"]?.toIntOrNull()?.let { deps.trackedTeachers.delete(it) }
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }
}

private fun Teacher.toJson() = jsonObj(
    "name" to JsonPrimitive(name),
    "slug" to JsonPrimitive(slug),
)

private fun TrackedTeacher.toJson() = jsonObj(
    "id" to JsonPrimitive(id),
    "name" to JsonPrimitive(name),
    "slug" to JsonPrimitive(slug),
)

private fun TeacherLesson.toJson() = jsonObj(
    "date" to JsonPrimitive(date),
    "n" to JsonPrimitive(n),
    "time_range" to JsonPrimitive(timeRange),
    "lesson" to JsonPrimitive(lesson),
    "type_name" to JsonPrimitive(typeName),
    "location" to JsonPrimitive(location),
    "groups" to JsonArray(groups.map { JsonPrimitive(it) }),
)
