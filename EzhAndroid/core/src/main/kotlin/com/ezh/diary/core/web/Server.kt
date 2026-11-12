package com.ezh.diary.core.web

import com.ezh.diary.core.EzhJson
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.serialization.Serializable

@Serializable
data class ErrorResponse(val error: String)

@Serializable
data class HealthResponse(val ok: Boolean = true, val version: String)

/**
 * HTTP-модуль ядра. Пока единственный маршрут — /api/health (он же нужен
 * Android-обвязке для проверки, что сервер поднялся). Остальные группы
 * маршрутов будут подключаться сюда же по этапам.
 */
fun Application.ezhModule(version: String) {
    install(ContentNegotiation) {
        json(EzhJson)
    }
    routing {
        get("/api/health") {
            call.respond(HealthResponse(version = version))
        }
    }
}

/** Ошибка API в формате Flask: HTTP-код + `{"error": "текст"}`. */
suspend fun ApplicationCall.respondError(status: HttpStatusCode, message: String) {
    respond(status, ErrorResponse(message))
}

/** Точка входа для :app (этап 7). Порт 5000 — прежний адрес Flask-сервера. */
fun startEzhServer(version: String, port: Int = 5000) =
    embeddedServer(CIO, port = port) { ezhModule(version) }
