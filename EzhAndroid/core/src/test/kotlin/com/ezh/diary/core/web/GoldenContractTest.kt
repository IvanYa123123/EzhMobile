package com.ezh.diary.core.web

import com.ezh.diary.core.EzhJson
import com.ezh.diary.core.FakeMoodleHttp
import com.ezh.diary.core.FakePlanner
import com.ezh.diary.core.FakeTeachersApi
import com.ezh.diary.core.fixturesDir
import com.ezh.diary.core.newDeps
import com.ezh.diary.core.storage.Bundles
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Паритет с Flask-версией (этап 9): replay golden-контракта против Kotlin-сборки.
 *
 * Контракт снят с Python до удаления бэкенда (tests/fixtures/golden/api_contract.json):
 * те же запросы, те же заглушки планировщика/преподавателей, санитизированные
 * DTSTAMP и exported_at. Любое расхождение в статусе, заголовках или теле — провал.
 */
class GoldenContractTest {

    private val contract: JsonObject by lazy {
        val file = File(fixturesDir(), "golden/api_contract.json")
        Json.parseToJsonElement(file.readText()).jsonObject
    }

    @Test
    fun `kotlin API matches python golden contract`() = testApplication {
        val cases = contract["cases"]!!.jsonArray
        val goldenSchedule = cases.first { case ->
            case.jsonObject["path"]!!.jsonPrimitive.content.startsWith("/api/schedule_all")
        }.jsonObject["body"]!!.jsonArray.map { it.jsonObject }

        val deps = newDeps(
            planner = FakePlanner(goldenSchedule),
            teacherApi = FakeTeachersApi(html = TEACHERS_HTML, ics = TEACHER_ICS),
            moodleHttp = FakeMoodleHttp(),
            bundles = Bundles { name ->
                File(assetsDir(), name).takeIf { it.isFile }?.readText(Charsets.UTF_8)
            },
            clock = { 0L },
        )
        application { ezhModule(deps) }

        for (case in cases) {
            val obj = case.jsonObject
            val method = obj["method"]!!.jsonPrimitive.content
            val path = obj["path"]!!.jsonPrimitive.content
            val requestBody = obj["request_body"]
                ?.takeIf { it !is JsonNull }
                ?.let { EzhJson.encodeToString(JsonElement.serializer(), it) }

            val response = when (method) {
                "POST" -> client.post(path) {
                    if (requestBody != null) {
                        contentType(ContentType.Application.Json)
                        setBody(requestBody)
                    }
                }
                else -> client.get(path)
            }

            assertEquals(
                obj["status"]!!.jsonPrimitive.int,
                response.status.value,
                "status for $method $path",
            )

            obj["headers"]?.jsonObject?.forEach { (name, expected) ->
                val actual = response.headers[name]
                    ?: throw AssertionError("missing header $name for $method $path")
                assertEquals(
                    normalizeHeader(name, expected.jsonPrimitive.content),
                    normalizeHeader(name, actual),
                    "header $name for $method $path",
                )
            }

            val bodyKind = obj["body_kind"]!!.jsonPrimitive.content
            val expected = obj["body"]!!
            val actualText = response.bodyAsText()
            if (bodyKind == "json") {
                assertEquals(expected, EzhJson.parseToJsonElement(actualText), "body for $method $path")
            } else {
                assertEquals(expected.jsonPrimitive.content, actualText, "text for $method $path")
            }
        }
    }

    private fun normalizeHeader(name: String, value: String): String =
        if (name.equals("Content-Type", ignoreCase = true)) {
            value.substringBefore(';').trim().lowercase()
        } else {
            value.trim()
        }

    private fun assetsDir(): File =
        listOf(
            "../app/src/main/assets",
            "../../EzhAndroid/app/src/main/assets",
            "EzhAndroid/app/src/main/assets",
            "../ezh_assets",
        ).map { File(it) }.first { File(it, "Group.txt").isFile }

    private companion object {
        val TEACHERS_HTML = """
            <ul class="teacher-list">
              <li class="teacher-list-item">
                <div class="teacher-name">Абаев Евгений Александрович</div>
                <a href="/teachers/abaev-evgenij-aleksandrovich">Открыть расписание</a>
              </li>
            </ul>
        """.trimIndent()

        val TEACHER_ICS = """
            BEGIN:VCALENDAR
            VERSION:2.0
            BEGIN:VEVENT
            DTSTART:20260907T101000
            DTEND:20260907T114000
            SUMMARY:Практикум (ПЗ)
            DESCRIPTION:Группы: ПИН/б-24-2-о
            LOCATION:Б-202
            END:VEVENT
            END:VCALENDAR
        """.trimIndent().replace("\n", "\r\n")
    }
}
