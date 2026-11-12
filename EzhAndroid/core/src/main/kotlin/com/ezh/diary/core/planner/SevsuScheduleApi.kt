package com.ezh.diary.core.planner

import java.io.IOException
import java.time.Duration
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Клиент `https://schedule.sevsu.ru/api/schedule`.
 *
 * Повторяет поведение requests+urllib3 из planner.py: 3 попытки с
 * нарастающей паузой на сетевых ошибках и 429/5xx, таймаут 8 секунд,
 * при любой проблеме — пустая неделя (расписание тогда соберётся
 * из шаблонов/кэша, как раньше).
 */
class SevsuScheduleApi(
    private val baseUrl: String = "https://schedule.sevsu.ru/api/schedule",
    private val client: OkHttpClient = defaultClient(),
    private val sleeper: (Long) -> Unit = { Thread.sleep(it) },
) : ScheduleApi {
    override fun week(group: String, week: Int): List<JsonObject> {
        val url = baseUrl.toHttpUrl().newBuilder()
            .addQueryParameter("v", "6.2")
            .addQueryParameter("section", "0")
            .addQueryParameter("group", group)
            .addQueryParameter("week", week.toString())
            .build()
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", USER_AGENT)
            .build()

        repeat(ATTEMPTS) { attempt ->
            try {
                client.newCall(request).execute().use { response ->
                    if (response.code == 200) {
                        val body = response.body?.string() ?: return emptyList()
                        return parseSchedule(body)
                    }
                    if (response.code !in RETRY_STATUSES) return emptyList()
                    if (attempt < ATTEMPTS - 1) sleeper(BACKOFF_MS * (attempt + 1))
                }
            } catch (e: IOException) {
                if (attempt < ATTEMPTS - 1) sleeper(BACKOFF_MS * (attempt + 1))
            }
        }
        return emptyList()
    }

    private fun parseSchedule(body: String): List<JsonObject> {
        val root = Json.parseToJsonElement(body) as? JsonObject ?: return emptyList()
        val ok = (root["ok"] as? JsonPrimitive)?.booleanOrNull
        if (ok != true) return emptyList()
        val schedule = root["schedule"] as? JsonArray ?: return emptyList()
        return schedule.filterIsInstance<JsonObject>()
    }

    companion object {
        private const val USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        private const val ATTEMPTS = 3
        private const val BACKOFF_MS = 500L
        private val RETRY_STATUSES = setOf(429, 500, 502, 503, 504)

        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(Duration.ofSeconds(8))
            .readTimeout(Duration.ofSeconds(8))
            .build()
    }
}
