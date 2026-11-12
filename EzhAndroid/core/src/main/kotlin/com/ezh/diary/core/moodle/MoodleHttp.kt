package com.ezh.diary.core.moodle

/** Ответ HTTP-запроса: итоговый URL после редиректов, код и текст. */
data class HttpResult(val url: String, val status: Int, val text: String)

/**
 * Сессия Moodle: cookies живут внутри реализации (как requests.Session).
 *
 * В тестах подменяется заглушкой, поэтому сервис не знает про OkHttp.
 */
interface MoodleHttp {
    fun get(url: String, timeoutSeconds: Int = 15): HttpResult
    fun postForm(url: String, fields: List<Pair<String, String>>, timeoutSeconds: Int = 15): HttpResult
    fun postJson(url: String, json: String, timeoutSeconds: Int = 15): HttpResult

    /** Все cookies сессии — их сохраняем на диск (moodle_cookies.json). */
    fun cookies(): Map<String, String>
}
