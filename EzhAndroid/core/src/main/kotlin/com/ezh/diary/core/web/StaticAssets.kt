package com.ezh.diary.core.web

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.response.header
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

/**
 * Статика интерфейса: в APK её отдаёт AssetManager, в тестах — карта.
 * Пути — относительно `static/` (`index.html`, `js/app.bundle.js`).
 */
fun interface StaticAssets {
    fun read(path: String): ByteArray?
}

/**
 * Порт `/` и `/static/<path>` из Flask.
 *
 * Cache-Control: no-cache — APK обновляется поверх установленного, а WebView
 * мог бы годами держать старый app.bundle.js из кэша (баг с «правки не
 * применились после обновления»).
 */
fun Route.staticRoutes(assets: StaticAssets) {
    get("/") {
        call.respondAsset(assets, "index.html")
    }
    get("/static/{path...}") {
        val path = call.parameters.getAll("path")?.joinToString("/").orEmpty()
        call.respondAsset(assets, path)
    }
}

private suspend fun ApplicationCall.respondAsset(assets: StaticAssets, path: String) {
    val safePath = path.trim('/')
    val bytes = if (safePath.isEmpty() || safePath.contains("..")) null else assets.read(safePath)
    if (bytes == null) {
        respondText("Not Found", status = HttpStatusCode.NotFound, contentType = CONTENT_TYPES.getValue("txt"))
        return
    }
    response.header("Cache-Control", "no-cache")
    response.header("Content-Security-Policy", CSP_HEADER)
    respondBytes(bytes, contentType = contentTypeOf(safePath), status = HttpStatusCode.OK)
}

private fun contentTypeOf(path: String): ContentType {
    val extension = path.substringAfterLast('.', "").lowercase()
    return CONTENT_TYPES[extension] ?: CONTENT_TYPES.getValue("bin")
}

private val CONTENT_TYPES: Map<String, ContentType> = mapOf(
    "html" to ContentType.parse("text/html; charset=utf-8"),
    "css" to ContentType.parse("text/css; charset=utf-8"),
    "js" to ContentType.parse("application/javascript; charset=utf-8"),
    "mjs" to ContentType.parse("application/javascript; charset=utf-8"),
    "json" to ContentType.parse("application/json; charset=utf-8"),
    "map" to ContentType.parse("application/json; charset=utf-8"),
    "txt" to ContentType.parse("text/plain; charset=utf-8"),
    "svg" to ContentType.parse("image/svg+xml"),
    "png" to ContentType.parse("image/png"),
    "jpg" to ContentType.parse("image/jpeg"),
    "jpeg" to ContentType.parse("image/jpeg"),
    "gif" to ContentType.parse("image/gif"),
    "webp" to ContentType.parse("image/webp"),
    "ico" to ContentType.parse("image/x-icon"),
    "woff" to ContentType.parse("font/woff"),
    "woff2" to ContentType.parse("font/woff2"),
    "ttf" to ContentType.parse("font/ttf"),
    "bin" to ContentType.parse("application/octet-stream"),
)
