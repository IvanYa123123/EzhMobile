package com.ezh.diary.core.teacher

import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request

/** Источник данных преподавателей — за интерфейсом, чтобы тесты работали без сети. */
interface TeachersApi {
    /** HTML страницы /teachers; null — сайт недоступен. */
    fun teachersHtml(): String?

    /** ICS расписания преподавателя; null — сайт недоступен или ответ не ICS. */
    fun ics(slug: String): String?
}

/** Живой сайт СевГУ: OkHttp, 3 попытки на 429/5xx и сетевые ошибки. */
class SevsuTeachersApi(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .build(),
    private val baseUrl: String = "https://schedule.sevsu.ru",
) : TeachersApi {
    override fun teachersHtml(): String? = fetch("$baseUrl/teachers", readTimeoutSeconds = 15)

    override fun ics(slug: String): String? =
        fetch("$baseUrl/calendar/teacher/$slug", readTimeoutSeconds = 25)
            ?.takeIf { "BEGIN:VCALENDAR" in it }

    private fun fetch(url: String, readTimeoutSeconds: Long): String? {
        val client = client.newBuilder()
            .readTimeout(readTimeoutSeconds, TimeUnit.SECONDS)
            .build()
        for (attempt in 1..ATTEMPTS) {
            try {
                val response = client.newCall(
                    Request.Builder().url(url).header("User-Agent", USER_AGENT).build()
                ).execute()
                response.use {
                    if (it.code == 200) return it.body?.string()
                    if (it.code !in RETRYABLE_STATUSES) return null
                }
            } catch (e: IOException) {
                // сеть отвалилась — повторяем, если попытки остались
            }
            if (attempt < ATTEMPTS) Thread.sleep(500L * attempt)
        }
        return null
    }

    private companion object {
        const val ATTEMPTS = 3
        val RETRYABLE_STATUSES = setOf(429, 500, 502, 503, 504)
        const val USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
}
