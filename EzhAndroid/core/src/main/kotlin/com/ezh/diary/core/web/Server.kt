package com.ezh.diary.core.web

import com.ezh.diary.core.EzhJson
import com.ezh.diary.core.db.initSchema
import com.ezh.diary.core.web.routes.backupRoutes
import com.ezh.diary.core.web.routes.groupsRoutes
import com.ezh.diary.core.web.routes.labsRoutes
import com.ezh.diary.core.web.routes.miscRoutes
import com.ezh.diary.core.web.routes.moodleRoutes
import com.ezh.diary.core.web.routes.scheduleRoutes
import com.ezh.diary.core.web.routes.tasksRoutes
import com.ezh.diary.core.web.routes.teachersRoutes
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import kotlinx.serialization.Serializable

@Serializable
data class ErrorResponse(val error: String)

@Serializable
data class HealthResponse(val ok: Boolean = true, val version: String)

/**
 * HTTP-модуль ядра. Все зависимости приходят через [ApiDeps] — так маршруты
 * можно тестировать на JVM без Android, а в :app подставить Android-базу и файлы.
 */
fun Application.ezhModule(deps: ApiDeps) {
    install(ContentNegotiation) {
        json(EzhJson)
    }
    deps.files.ensure()
    deps.db.initSchema()
    routing {
        deps.assets?.let { staticRoutes(it) }
        get("/api/health") {
            call.response.header("Cache-Control", "no-store")
            call.respond(HealthResponse(version = deps.version))
        }
        groupsRoutes(deps)
        tasksRoutes(deps)
        labsRoutes(deps)
        miscRoutes(deps)
        backupRoutes(deps)
        scheduleRoutes(deps)
        teachersRoutes(deps)
        moodleRoutes(deps)
    }
}

/** Ошибка API в формате Flask: HTTP-код + `{"error": "текст"}`. */
suspend fun ApplicationCall.respondError(status: HttpStatusCode, message: String) {
    // Flask ставил no-store на все ответы, кроме явно кэшируемых.
    response.header("Cache-Control", "no-store")
    respond(status, ErrorResponse(message))
}

/**
 * Точка входа для :app (этап 7). Порт 5000 — прежний адрес Flask-сервера.
 * Возвращает управление сразу: сервер крутится в собственных потоках CIO.
 */
fun startEzhServer(deps: ApiDeps, port: Int = 5000) {
    embeddedServer(CIO, port = port, host = "127.0.0.1") { ezhModule(deps) }
        .start(wait = false)
}
