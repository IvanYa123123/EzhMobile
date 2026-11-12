package com.ezh.diary.core.web

import com.ezh.diary.core.EzhJson
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receiveText
import io.ktor.server.response.header
import io.ktor.server.response.respondText
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

val JSON: ContentType = ContentType.parse("application/json")
val TEXT_PLAIN_UTF8: ContentType = ContentType.parse("text/plain; charset=utf-8")
val TEXT_CALENDAR_UTF8: ContentType = ContentType.parse("text/calendar; charset=utf-8")

const val CSP_HEADER: String = "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; " +
    "connect-src 'self' http://127.0.0.1:5000; object-src 'none'; base-uri 'self'; " +
    "form-action 'self'; frame-ancestors 'none'"

/** Порт _s(): null -> default, всё остальное -> строка без пробелов по краям. */
fun strOf(value: JsonElement?, default: String = ""): String = when (value) {
    null, is JsonNull -> default
    is JsonPrimitive -> value.contentOrNull?.trim() ?: default
    else -> value.toString().trim()
}

/** Порт _to_int(): int(12.9)=12, int("12")=12, остальное — default. */
fun intOf(value: JsonElement?, default: Int = 0): Int {
    val primitive = value as? JsonPrimitive ?: return default
    if (primitive.isString) {
        // int("12") работает, int("12.5") — нет (как в Python).
        return primitive.contentOrNull?.trim()?.toIntOrNull() ?: default
    }
    primitive.intOrNull?.let { return it }
    primitive.doubleOrNull?.let { return it.toInt() }
    return default
}

fun boolOf(value: JsonElement?, default: Boolean = false): Boolean =
    (value as? JsonPrimitive)?.booleanOrNull ?: default

fun JsonObject.text(key: String, default: String = ""): String = strOf(this[key], default)
fun JsonObject.number(key: String, default: Int = 0): Int = intOf(this[key], default)

fun jsonObj(vararg pairs: Pair<String, JsonElement>): JsonObject = JsonObject(pairs.toMap())
fun jsonArrayOf(values: Iterable<JsonElement>): JsonArray = JsonArray(values.toList())

/** Тело запроса как объект; что-то другое — пустой объект (как get_json(silent=True) or {}). */
suspend fun ApplicationCall.receiveJsonObject(): JsonObject {
    val element = try {
        EzhJson.parseToJsonElement(receiveText())
    } catch (e: Exception) {
        null
    }
    return element as? JsonObject ?: JsonObject(emptyMap())
}

suspend fun ApplicationCall.receiveJsonElement(): JsonElement? = try {
    EzhJson.parseToJsonElement(receiveText())
} catch (e: Exception) {
    null
}

suspend fun ApplicationCall.respondJson(
    body: JsonElement,
    status: HttpStatusCode = HttpStatusCode.OK,
    cacheControl: String = "no-store",
) {
    respondBody(
        EzhJson.encodeToString(JsonElement.serializer(), body),
        JSON,
        status,
        extraHeaders = mapOf("Cache-Control" to cacheControl),
    )
}

suspend fun ApplicationCall.respondJsonObject(
    body: JsonObject,
    status: HttpStatusCode = HttpStatusCode.OK,
    cacheControl: String = "no-store",
) = respondJson(body, status, cacheControl)

suspend fun ApplicationCall.respondBody(
    text: String,
    contentType: ContentType,
    status: HttpStatusCode = HttpStatusCode.OK,
    extraHeaders: Map<String, String> = emptyMap(),
) {
    extraHeaders.forEach { (name, value) -> response.header(name, value) }
    if (!response.headers.contains("Cache-Control")) {
        response.header("Cache-Control", "no-store")
    }
    response.header("Content-Security-Policy", CSP_HEADER)
    respondText(text, contentType, status)
}
