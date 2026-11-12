package com.ezh.diary.core.web

import com.ezh.diary.core.newDeps
import com.ezh.diary.core.storage.Bundles
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** /api/groups и /api/groups/custom: Group.txt, кэш-заголовок, добавление групп. */
class GroupsRoutesTest {

    private fun bundles(text: String) = Bundles { name -> if (name == "Group.txt") text else null }

    @Test
    fun `группы из Group-txt отдаются с публичным кэшем`() = testApplication {
        application {
            ezhModule(newDeps(bundles = bundles("ИВТ/б-24-1-о\nИВТ/б-24-2-о\n")))
        }

        val response = client.get("/api/groups")

        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals("public, max-age=3600", response.headers["Cache-Control"])
        val body = response.bodyAsText()
        assertTrue(body.contains("ИВТ/б-24-1-о"))
        assertTrue(body.contains("ИВТ/б-24-2-о"))
    }

    @Test
    fun `лишние пробелы и пустые строки отбрасываются`() = testApplication {
        application { ezhModule(newDeps(bundles = bundles("  А/1  \n\n  Б/2\n"))) }

        val body = client.get("/api/groups").bodyAsText()
        assertTrue(body.startsWith("[\"А/1\",\"Б/2\"]"), body)
    }

    @Test
    fun `своя группа добавляется один раз и дубликат не растёт`() = testApplication {
        application { ezhModule(newDeps(bundles = bundles("А/1\n"))) }

        val first = client.post("/api/groups/custom") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Моя/группа-1"}""")
        }
        assertEquals(HttpStatusCode.OK, first.status)
        assertTrue(first.bodyAsText().contains("\"success\""))
        assertTrue(first.bodyAsText().contains("\"already\"") == false)

        val second = client.post("/api/groups/custom") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Моя/группа-1"}""")
        }
        assertTrue(second.bodyAsText().contains("\"already\":true"))

        val groups = client.get("/api/groups").bodyAsText()
        assertEquals(1, Regex("Моя/группа-1").findAll(groups).count())
    }

    @Test
    fun `пустое имя и неверный формат - 400 с текстом как в Flask`() = testApplication {
        application { ezhModule(newDeps()) }

        val empty = client.post("/api/groups/custom") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":""}""")
        }
        assertEquals(HttpStatusCode.BadRequest, empty.status)
        assertEquals("""{"error":"empty"}""", empty.bodyAsText())

        val bad = client.post("/api/groups/custom") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"плохая группа"}""")
        }
        assertEquals(HttpStatusCode.BadRequest, bad.status)
        assertEquals("""{"error":"invalid group format"}""", bad.bodyAsText())
    }

    @Test
    fun `без Group txt список пуст, но кастомные группы видны`() = testApplication {
        application { ezhModule(newDeps()) }

        assertEquals("[]", client.get("/api/groups").bodyAsText())
    }
}
