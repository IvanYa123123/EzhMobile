package com.ezh.diary.core.web

import com.ezh.diary.core.FakeTeachersApi
import com.ezh.diary.core.fixturesDir
import com.ezh.diary.core.newDeps
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.io.File
import java.util.zip.GZIPInputStream
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TeachersApiTest {
    private fun fixture(name: String): String {
        val dir = fixturesDir() ?: error("не найден tests/fixtures")
        return GZIPInputStream(File(dir, "site/$name").inputStream())
            .bufferedReader(Charsets.UTF_8)
            .readText()
    }

    @Test
    fun teachersListUsesServiceAndCacheHeader() = testApplication {
        val api = FakeTeachersApi(
            html = """
                <ul><li><div>Абаев Евгений Александрович</div>
                <a href="/teachers/abaev-evgenij-aleksandrovich">Открыть расписание</a></li></ul>
            """.trimIndent(),
        )
        val deps = newDeps(teacherApi = api)
        application { ezhModule(deps) }

        val response = client.get("/api/teachers")
        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("public, max-age=3600", response.headers["Cache-Control"])

        val array = Json.parseToJsonElement(response.bodyAsText()) as JsonArray
        assertEquals(1, array.size)
        assertEquals(
            "Абаев Евгений Александрович",
            array[0].jsonObject["name"]!!.jsonPrimitive.content,
        )
        assertEquals(
            "abaev-evgenij-aleksandrovich",
            array[0].jsonObject["slug"]!!.jsonPrimitive.content,
        )
        assertEquals(1, api.htmlCalls)
    }

    @Test
    fun teacherScheduleReturnsParsedIcs() = testApplication {
        val slug = "abaev-evgenij-aleksandrovich"
        val api = FakeTeachersApi(ics = fixture("teacher_$slug.ics.gz"))
        val deps = newDeps(teacherApi = api)
        application { ezhModule(deps) }

        val response = client.get("/api/teacher_schedule?slug=$slug")
        assertEquals(HttpStatusCode.OK, response.status)

        val array = Json.parseToJsonElement(response.bodyAsText()) as JsonArray
        assertEquals(600, array.size)
        val first = array[0].jsonObject
        assertEquals("2025-09-05", first["date"]!!.jsonPrimitive.content)
        assertEquals("10:10 - 11:40", first["time_range"]!!.jsonPrimitive.content)
        assertTrue(first["lesson"]!!.jsonPrimitive.content.isNotBlank())
        assertTrue(first["groups"] is JsonArray)

        assertEquals("[]", client.get("/api/teacher_schedule?slug=").bodyAsText())
        assertEquals("[]", client.get("/api/teacher_schedule?slug=../x").bodyAsText())
    }

    @Test
    fun trackedTeachersCrud() = testApplication {
        val deps = newDeps()
        application { ezhModule(deps) }

        val created = client.post("/api/tracked_teachers") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Абаев Евгений Александрович","slug":"Abaev-Evgenij-Aleksandrovich"}""")
        }
        assertEquals(HttpStatusCode.OK, created.status)
        val createdJson = Json.parseToJsonElement(created.bodyAsText()).jsonObject
        val id = createdJson["id"]!!.jsonPrimitive.content
        assertEquals("abaev-evgenij-aleksandrovich", createdJson["slug"]!!.jsonPrimitive.content)
        assertFalse(createdJson["already"]!!.jsonPrimitive.content.toBoolean())

        val again = client.post("/api/tracked_teachers") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Другое имя","slug":"abaev-evgenij-aleksandrovich"}""")
        }
        val againJson = Json.parseToJsonElement(again.bodyAsText()).jsonObject
        assertTrue(againJson["already"]!!.jsonPrimitive.content.toBoolean())
        assertEquals(id, againJson["id"]!!.jsonPrimitive.content)

        val bad = client.post("/api/tracked_teachers") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":""}""")
        }
        assertEquals(HttpStatusCode.BadRequest, bad.status)

        val list = Json.parseToJsonElement(client.get("/api/tracked_teachers").bodyAsText()) as JsonArray
        assertEquals(1, list.size)
        assertEquals(
            "Абаев Евгений Александрович",
            list[0].jsonObject["name"]!!.jsonPrimitive.content,
        )

        assertEquals(
            """{"success":true}""",
            client.delete("/api/tracked_teachers/$id").bodyAsText(),
        )
        assertEquals("[]", client.get("/api/tracked_teachers").bodyAsText())
    }
}
