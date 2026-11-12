package com.ezh.diary.core.web.routes

import com.ezh.diary.core.db.Task
import com.ezh.diary.core.web.ApiDeps
import com.ezh.diary.core.web.Ics
import com.ezh.diary.core.web.TEXT_CALENDAR_UTF8
import com.ezh.diary.core.web.TEXT_PLAIN_UTF8
import com.ezh.diary.core.web.Validation
import com.ezh.diary.core.web.enforceRate
import com.ezh.diary.core.web.jsonObj
import com.ezh.diary.core.web.number
import com.ezh.diary.core.web.receiveJsonObject
import com.ezh.diary.core.web.respondBody
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
import kotlinx.serialization.json.JsonPrimitive

private val TASK_STATUSES = setOf("green", "orange", "red", "completed")

fun Route.tasksRoutes(deps: ApiDeps) {
    get("/api/tasks") {
        if (!call.enforceRate(deps, "tasks", 300)) return@get
        val start = call.request.queryParameters["start"]
        val end = call.request.queryParameters["end"]
        if (start.isNullOrEmpty() || end.isNullOrEmpty()) {
            return@get call.respondJson(JsonArray(emptyList()))
        }
        call.respondJson(JsonArray(deps.tasks.listBetween(start, end).map { it.toJson() }))
    }

    post("/api/tasks") {
        if (!call.enforceRate(deps, "tasks", 300)) return@post
        val data = call.receiveJsonObject()
        val date = Validation.baseDate(data.text("date"))
            ?: return@post call.respondError(HttpStatusCode.BadRequest, "invalid date")
        val text = data.text("text")
        if (text.isEmpty()) return@post call.respondError(HttpStatusCode.BadRequest, "required")
        if (text.length > 2000) {
            return@post call.respondError(HttpStatusCode.BadRequest, "text too long")
        }
        var status = data.text("status", "green")
        if (status !in TASK_STATUSES) status = "green"
        val id = deps.tasks.insert(date, text, status)
        call.respondJson(jsonObj("id" to JsonPrimitive(id)))
    }

    put("/api/tasks/{id}") {
        if (!call.enforceRate(deps, "tasks", 300)) return@put
        val id = call.parameters["id"]?.toIntOrNull()
            ?: return@put call.respondError(HttpStatusCode.NotFound, "not found")
        val data = call.receiveJsonObject()
        val date = Validation.baseDate(data.text("date"))
            ?: return@put call.respondError(HttpStatusCode.BadRequest, "invalid date")
        val text = data.text("text")
        if (text.isEmpty()) return@put call.respondError(HttpStatusCode.BadRequest, "required")
        if (text.length > 2000) {
            return@put call.respondError(HttpStatusCode.BadRequest, "text too long")
        }
        var status = data.text("status", "green")
        if (status !in TASK_STATUSES) status = "green"
        deps.tasks.update(id, date, text, status)
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }

    delete("/api/tasks/{id}") {
        if (!call.enforceRate(deps, "tasks", 300)) return@delete
        val id = call.parameters["id"]?.toIntOrNull()
            ?: return@delete call.respondError(HttpStatusCode.NotFound, "not found")
        deps.tasks.delete(id)
        call.respondJson(jsonObj("success" to JsonPrimitive(true)))
    }

    get("/api/task_dates") {
        if (!call.enforceRate(deps, "task_dates", 120)) return@get
        call.respondJson(JsonArray(deps.tasks.distinctDates().map { JsonPrimitive(it) }))
    }

    get("/api/tasks.ics") {
        if (!call.enforceRate(deps, "tasks_ics", 30)) return@get
        // Flask сортирует ORDER BY date, id — так события стабильнее в календаре.
        val tasks = deps.tasks.list().sortedWith(compareBy({ it.date }, { it.id }))
        if (tasks.isEmpty()) {
            return@get call.respondBody(
                "Заметок пока нет — сначала добавьте хотя бы одну.",
                TEXT_PLAIN_UTF8,
                HttpStatusCode.Conflict,
            )
        }
        call.respondBody(
            Ics.tasksIcs(tasks, Ics.utcStampAt(deps.clock())),
            TEXT_CALENDAR_UTF8,
            extraHeaders = mapOf("Content-Disposition" to "attachment; filename=\"ezh_notes.ics\""),
        )
    }
}

private fun Task.toJson() = jsonObj(
    "id" to JsonPrimitive(id),
    "date" to JsonPrimitive(date),
    "text" to JsonPrimitive(text),
    "status" to JsonPrimitive(status),
)
