package com.ezh.diary.core.moodle

import java.util.concurrent.TimeUnit
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.FormBody
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** UA как в Flask-версии: СевГУ отдаёт разную вёрстку разным клиентам. */
const val MOODLE_USER_AGENT: String =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Cookies всех доменах в одной карте: Flask-версия сохраняла session.cookies
 * без доменов и возвращала их обратно с domain="do.sevsu.ru".
 */
class MemoryCookieJar(initial: Map<String, String> = emptyMap()) : CookieJar {
    private val values = LinkedHashMap<String, String>()

    init {
        initial.forEach { (name, value) -> values[name] = value }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> =
        values.mapNotNull { (name, value) ->
            try {
                Cookie.Builder()
                    .name(name)
                    .value(value)
                    .domain(url.host)
                    .path("/")
                    .build()
            } catch (_: IllegalArgumentException) {
                null
            }
        }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        cookies.forEach { values[it.name] = it.value }
    }

    fun snapshot(): Map<String, String> = LinkedHashMap(values)
}

/** Живая реализация: OkHttp + cookies в памяти. */
class OkHttpMoodleHttp(
    initialCookies: Map<String, String> = emptyMap(),
    private val client: OkHttpClient = OkHttpClient.Builder()
        .followRedirects(true)
        .followSslRedirects(true)
        .connectTimeout(10, TimeUnit.SECONDS)
        .build(),
) : MoodleHttp {
    private val jar = MemoryCookieJar(initialCookies)
    private val withJar: OkHttpClient = client.newBuilder().cookieJar(jar).build()

    override fun get(url: String, timeoutSeconds: Int): HttpResult =
        execute(Request.Builder().url(url).header("User-Agent", MOODLE_USER_AGENT).get().build(), timeoutSeconds)

    override fun postForm(url: String, fields: List<Pair<String, String>>, timeoutSeconds: Int): HttpResult {
        val body = FormBody.Builder().apply { fields.forEach { add(it.first, it.second) } }.build()
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", MOODLE_USER_AGENT)
            .post(body)
            .build()
        return execute(request, timeoutSeconds)
    }

    override fun postJson(url: String, json: String, timeoutSeconds: Int): HttpResult {
        val body = json.toRequestBody("application/json; charset=utf-8".toMediaType())
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", MOODLE_USER_AGENT)
            .post(body)
            .build()
        return execute(request, timeoutSeconds)
    }

    override fun cookies(): Map<String, String> = jar.snapshot()

    private fun execute(request: Request, timeoutSeconds: Int): HttpResult {
        val call = withJar.newCall(request)
        call.timeout().timeout(timeoutSeconds.toLong(), TimeUnit.SECONDS)
        call.execute().use { response ->
            val body = response.body?.string() ?: ""
            return HttpResult(
                url = response.request.url.toString(),
                status = response.code,
                text = body,
            )
        }
    }
}
