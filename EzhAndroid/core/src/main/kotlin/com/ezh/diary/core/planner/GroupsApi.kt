package com.ezh.diary.core.planner

import com.ezh.diary.core.EzhJson
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.OkHttpClient
import okhttp3.Request

/** Список групп сайта: нужен, только если в APK нет Group.txt. */
fun interface GroupsApi {
    fun groups(): List<String>
}

/** Порт planner.groups_api: GET /api/groups, ошибки — пустой список (как в Python). */
class SevsuGroupsApi(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build(),
    private val baseUrl: String = "https://schedule.sevsu.ru",
) : GroupsApi {
    override fun groups(): List<String> = try {
        val request = Request.Builder()
            .url("$baseUrl/api/groups?v=6.2&section=0")
            .header("User-Agent", USER_AGENT)
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return emptyList()
            val root = EzhJson.parseToJsonElement(response.body?.string().orEmpty())
            (root as? JsonArray).orEmpty().mapNotNull(::nameOf)
        }
    } catch (e: Exception) {
        emptyList()
    }

    private fun nameOf(element: kotlinx.serialization.json.JsonElement): String? {
        val primitive = when (element) {
            is JsonPrimitive -> element
            is JsonObject -> element["name"] ?: element["title"]
            else -> null
        }
        return (primitive as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }?.trim()
    }

    private companion object {
        const val USER_AGENT =
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/120.0.0.0 Mobile Safari/537.36"
    }
}
