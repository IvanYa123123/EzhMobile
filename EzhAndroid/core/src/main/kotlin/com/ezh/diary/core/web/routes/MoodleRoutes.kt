package com.ezh.diary.core.web.routes

import com.ezh.diary.core.EzhJson
import com.ezh.diary.core.moodle.LoginResult
import com.ezh.diary.core.moodle.MoodleCourse
import com.ezh.diary.core.moodle.StatsResult
import com.ezh.diary.core.web.ApiDeps
import com.ezh.diary.core.web.receiveJsonObject
import com.ezh.diary.core.web.respondError
import com.ezh.diary.core.web.respondJson
import com.ezh.diary.core.web.strOf
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Как в Flask: отсутствующий номер оценки всё равно сериализуется как `null`. */
private val MOODLE_JSON = Json(EzhJson) { explicitNulls = true }

/** Порт blueprint'а moodle_pro: статус, вход, выход, отмена, статистика. */
fun Route.moodleRoutes(deps: ApiDeps) {
    val moodle = deps.moodleService

    get("/api/moodle/status") {
        call.respondJson(buildJsonObject {
            put("logged_in", JsonPrimitive(moodle.status()))
        })
    }

    post("/api/moodle/login") {
        val data = call.receiveJsonObject()
        when (val result = moodle.login(
            username = strOf(data["username"]).ifEmpty { null },
            password = strOf(data["password"]).ifEmpty { null },
        )) {
            is LoginResult.Success -> call.respondJson(buildJsonObject { put("success", JsonPrimitive(true)) })
            is LoginResult.Failure -> call.respondError(HttpStatusCode.fromValue(result.status), result.message)
        }
    }

    post("/api/moodle/logout") {
        moodle.logout()
        call.respondJson(buildJsonObject { put("success", JsonPrimitive(true)) })
    }

    post("/api/moodle/cancel") {
        moodle.cancel()
        call.respondJson(buildJsonObject { put("success", JsonPrimitive(true)) })
    }

    get("/api/moodle/stats") {
        val force = call.request.queryParameters["force"] == "1"
        when (val result = moodle.stats(force)) {
            is StatsResult.Ok -> call.respondJson(
                buildJsonObject {
                    put(
                        "data",
                        MOODLE_JSON.encodeToJsonElement(ListSerializer(MoodleCourse.serializer()), result.data),
                    )
                    put("timestamp", JsonPrimitive(result.timestamp))
                    put(
                        "warnings",
                        EzhJson.encodeToJsonElement(
                            ListSerializer(JsonPrimitive.serializer()),
                            result.warnings.map { JsonPrimitive(it) },
                        ),
                    )
                    put("incomplete", JsonPrimitive(result.warnings.isNotEmpty()))
                },
            )
            is StatsResult.Failure -> call.respondError(HttpStatusCode.fromValue(result.status), result.message)
        }
    }
}
