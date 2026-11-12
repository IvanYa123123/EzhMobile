package com.ezh.diary.core.web

import com.ezh.diary.core.FakeMoodleHttp
import com.ezh.diary.core.newDeps
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MoodleApiTest {
    @Test
    fun statusReturnsLoggedInFalseWithoutCookies() = testApplication {
        val deps = newDeps(moodleHttp = FakeMoodleHttp())
        application { ezhModule(deps) }

        val response = client.get("/api/moodle/status")

        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertFalse(body["logged_in"]!!.jsonPrimitive.boolean)
    }

    @Test
    fun loginRequiresCredentials() = testApplication {
        val deps = newDeps(moodleHttp = FakeMoodleHttp())
        application { ezhModule(deps) }

        val response = client.post("/api/moodle/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"username":"","password":""}""")
        }

        assertEquals(HttpStatusCode.BadRequest, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("Введите логин и пароль", body["error"]!!.jsonPrimitive.content)
    }

    @Test
    fun loginSuccessWritesCookies() = testApplication {
        val http = FakeMoodleHttp()
            .on("/login/index.php", """<a href="/auth/oauth2/login.php">СевГУ</a>""")
            .on("auth/oauth2/login.php", """<form action="https://auth.sevsu.ru/sso/login"><input name="execution" value="x"></form>""")
            .on("sso/login", finalUrl = "https://do.sevsu.ru/my/")
        http.cookiesMap = mapOf("MoodleSession" to "abc")
        val deps = newDeps(moodleHttp = http)
        application { ezhModule(deps) }

        val response = client.post("/api/moodle/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"username":"user","password":"pass"}""")
        }

        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(Json.parseToJsonElement(response.bodyAsText()).jsonObject["success"]!!.jsonPrimitive.boolean)
        assertTrue(deps.files.moodleCookiesFile.exists())
    }

    @Test
    fun statsFromCacheIncludeWarningsAndIncomplete() = testApplication {
        val deps = newDeps(moodleHttp = FakeMoodleHttp())
        application { ezhModule(deps) }
        deps.files.moodleCacheFile.writeText(
            """{"timestamp":1200.0,"data":[],"warnings":["Вёрстка изменилась"]}""",
            Charsets.UTF_8,
        )

        val response = client.get("/api/moodle/stats")

        assertEquals(HttpStatusCode.OK, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals(1200.0, body["timestamp"]!!.jsonPrimitive.content.toDouble(), 0.001)
        assertTrue(body["incomplete"]!!.jsonPrimitive.boolean)
        assertEquals(
            "Вёрстка изменилась",
            body["warnings"]!!.jsonArray[0].jsonPrimitive.content,
        )
    }

    @Test
    fun statsExpiredSessionReturns401() = testApplication {
        val http = FakeMoodleHttp().on("/my/", finalUrl = "https://auth.sevsu.ru/login")
        val deps = newDeps(moodleHttp = http)
        application { ezhModule(deps) }

        val response = client.get("/api/moodle/stats?force=1")

        assertEquals(HttpStatusCode.Unauthorized, response.status)
        val body = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("Сессия устарела", body["error"]!!.jsonPrimitive.content)
    }

    @Test
    fun logoutAlwaysSucceeds() = testApplication {
        val deps = newDeps(moodleHttp = FakeMoodleHttp())
        application { ezhModule(deps) }

        val response = client.post("/api/moodle/logout")

        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(Json.parseToJsonElement(response.bodyAsText()).jsonObject["success"]!!.jsonPrimitive.boolean)
    }
}
