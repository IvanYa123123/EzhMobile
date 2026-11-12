package com.ezh.diary.core.web

import com.ezh.diary.core.FakePlanner
import com.ezh.diary.core.newDeps
import com.ezh.diary.core.scheduleItem
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Этап 4: CRUD, поиск, бэкап, расписание — поведение как в Flask-версии. */
class ApiTest {
    @Test
    fun tasksCrud() = testApplication {
        val deps = newDeps()
        application { ezhModule(deps) }

        val created = client.post("/api/tasks") {
            contentType(ContentType.Application.Json)
            setBody("""{"date":"2026-09-10","text":"Контрольная"}""")
        }
        assertEquals(HttpStatusCode.OK, created.status)
        assertEquals("""{"id":1}""", created.bodyAsText())

        val listed = client.get("/api/tasks?start=2026-09-01&end=2026-09-30")
        val array = Json.parseToJsonElement(listed.bodyAsText()) as JsonArray
        assertEquals(1, array.size)
        assertEquals("Контрольная", array[0].jsonObject["text"]!!.jsonPrimitive.content)

        val updated = client.put("/api/tasks/1") {
            contentType(ContentType.Application.Json)
            setBody("""{"date":"2026-09-10","text":"Контрольная","status":"completed"}""")
        }
        assertEquals("""{"success":true}""", updated.bodyAsText())

        val dates = client.get("/api/task_dates").bodyAsText()
        assertEquals("""["2026-09-10"]""", dates)

        val removed = client.delete("/api/tasks/1")
        assertEquals("""{"success":true}""", removed.bodyAsText())
        assertEquals("[]", client.get("/api/task_dates").bodyAsText())
    }

    @Test
    fun taskValidationAndIcs() = testApplication {
        val deps = newDeps()
        application { ezhModule(deps) }

        val badDate = client.post("/api/tasks") {
            contentType(ContentType.Application.Json)
            setBody("""{"date":"10.09.2026","text":"x"}""")
        }
        assertEquals(HttpStatusCode.BadRequest, badDate.status)
        assertEquals("""{"error":"invalid date"}""", badDate.bodyAsText())

        val emptyIcs = client.get("/api/tasks.ics")
        assertEquals(HttpStatusCode.Conflict, emptyIcs.status)

        client.post("/api/tasks") {
            contentType(ContentType.Application.Json)
            setBody("""{"date":"2026-09-11","text":"Сдать отчёт"}""")
        }
        val ics = client.get("/api/tasks.ics")
        assertEquals(HttpStatusCode.OK, ics.status)
        assertEquals("text/calendar; charset=utf-8", ics.headers["Content-Type"])
        assertEquals("attachment; filename=\"ezh_notes.ics\"", ics.headers["Content-Disposition"])
        assertTrue(ics.bodyAsText().contains("SUMMARY:Сдать отчёт"))
    }

    @Test
    fun labsAndLabItems() = testApplication {
        val deps = newDeps()
        application { ezhModule(deps) }

        val saved = client.post("/api/labs") {
            contentType(ContentType.Application.Json)
            setBody("""[{"group":"PIN","subject":"Физика (ЛЗ)","completed":1,"total":2}]""")
        }
        assertEquals("""{"success":true}""", saved.bodyAsText())

        val progress = Json.parseToJsonElement(
            client.get("/api/labs?group=PIN").bodyAsText(),
        ).jsonObject
        assertEquals(1, progress["Физика (ЛЗ)"]!!.jsonObject["completed"]!!.jsonPrimitive.int)
        assertEquals(2, progress["Физика (ЛЗ)"]!!.jsonObject["total"]!!.jsonPrimitive.int)

        client.post("/api/lab_items/sync") {
            contentType(ContentType.Application.Json)
            setBody("""{"group":"PIN","items":[{"subject":"Физика (ЛЗ)","count":2}]}""")
        }
        val items = Json.parseToJsonElement(
            client.get("/api/lab_items?group=PIN").bodyAsText(),
        ).jsonObject["Физика (ЛЗ)"]!! as JsonArray
        assertEquals(2, items.size)
        assertEquals("ЛЗ1", items[0].jsonObject["title"]!!.jsonPrimitive.content)
        assertEquals(0, items[0].jsonObject["completed"]!!.jsonPrimitive.int)

        val firstId = items[0].jsonObject["id"]!!.jsonPrimitive.int
        client.put("/api/lab_items/$firstId") {
            contentType(ContentType.Application.Json)
            setBody("""{"completed":1}""")
        }
        val afterUpdate = Json.parseToJsonElement(
            client.get("/api/lab_items?group=PIN").bodyAsText(),
        ).jsonObject["Физика (ЛЗ)"]!! as JsonArray
        assertEquals(1, afterUpdate[0].jsonObject["completed"]!!.jsonPrimitive.int)
    }

    @Test
    fun friendsHaveNoCategory() = testApplication {
        val deps = newDeps()
        application { ezhModule(deps) }

        val created = client.post("/api/friends") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Вася","group":"PIN","subgroup":"1","category":"Папка"}""")
        }
        assertEquals(HttpStatusCode.OK, created.status)

        val list = Json.parseToJsonElement(client.get("/api/friends").bodyAsText()) as JsonArray
        assertEquals(1, list.size)
        assertTrue(list[0].jsonObject.keys.none { it == "category" })
        assertEquals("PIN", list[0].jsonObject["group"]!!.jsonPrimitive.content)

        val badGroup = client.post("/api/friends") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Вася","group":"in valid"}""")
        }
        assertEquals(HttpStatusCode.BadRequest, badGroup.status)
        assertEquals("""{"error":"invalid group format"}""", badGroup.bodyAsText())
    }

    @Test
    fun subjectsAndSearch() = testApplication {
        val deps = newDeps()
        application { ezhModule(deps) }

        client.post("/api/subjects") {
            contentType(ContentType.Application.Json)
            setBody("""{"subject":"Математика","link":"javascript:alert(1)","teacher":"Иванов"}""")
        }
        val subjects = Json.parseToJsonElement(client.get("/api/subjects").bodyAsText()).jsonObject
        assertEquals("", subjects["Математика"]!!.jsonObject["link"]!!.jsonPrimitive.content)

        client.post("/api/tasks") {
            contentType(ContentType.Application.Json)
            setBody("""{"date":"2026-09-12","text":"Лабораторная по физике"}""")
        }
        val short = Json.parseToJsonElement(client.get("/api/search?q=Л").bodyAsText()).jsonObject
        assertEquals(0, short["count"]!!.jsonPrimitive.int)

        val found = Json.parseToJsonElement(client.get("/api/search?q=физике").bodyAsText()).jsonObject
        assertEquals(1, found["count"]!!.jsonPrimitive.int)
    }

    @Test
    fun customScheduleCrud() = testApplication {
        val deps = newDeps()
        application { ezhModule(deps) }

        val created = client.post("/api/custom_schedule") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"group":"PIN","lesson":"Консультация","base_date":"2026-11-10",""" +
                    """"time_range":"14:00 - 15:30"}""",
            )
        }
        val id = Json.parseToJsonElement(created.bodyAsText()).jsonObject["id"]!!.jsonPrimitive.int

        val listed = Json.parseToJsonElement(
            client.get("/api/custom_schedule?group=PIN").bodyAsText(),
        ) as JsonArray
        assertEquals(1, listed.size)
        assertEquals("none", listed[0].jsonObject["recurrence"]!!.jsonPrimitive.content)
        assertEquals("[]", listed[0].jsonObject["exceptions"]!!.jsonPrimitive.content)

        val updated = client.put("/api/custom_schedule/$id") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"lesson":"Экзамен","base_date":"2026-11-10","time_range":"14:00 - 15:30"}""",
            )
        }
        assertEquals("""{"success":true}""", updated.bodyAsText())

        val after = Json.parseToJsonElement(
            client.get("/api/custom_schedule?group=PIN").bodyAsText(),
        ) as JsonArray
        assertEquals("Экзамен", after[0].jsonObject["lesson"]!!.jsonPrimitive.content)

        client.delete("/api/custom_schedule/$id")
        assertEquals("[]", client.get("/api/custom_schedule?group=PIN").bodyAsText())
    }

    @Test
    fun backupRoundtrip() = testApplication {
        val deps = newDeps()
        application { ezhModule(deps) }

        client.post("/api/tasks") {
            contentType(ContentType.Application.Json)
            setBody("""{"date":"2026-09-13","text":"Задача для бэкапа"}""")
        }
        val dump = client.get("/api/backup").bodyAsText()
        val backup = Json.parseToJsonElement(dump).jsonObject
        assertEquals("EZHednevnik", backup["app"]!!.jsonPrimitive.content)
        assertEquals(1, (backup["tables"]!!.jsonObject["tasks"] as JsonArray).size)

        client.delete("/api/tasks/1")
        assertEquals("[]", client.get("/api/task_dates").bodyAsText())

        val restored = client.post("/api/backup") {
            contentType(ContentType.Application.Json)
            setBody(dump)
        }
        assertEquals(HttpStatusCode.OK, restored.status)
        assertTrue(restored.bodyAsText().contains("\"success\":true"))
        assertEquals("""["2026-09-13"]""", client.get("/api/task_dates").bodyAsText())

        val broken = client.post("/api/backup") {
            contentType(ContentType.Application.Json)
            setBody("""{"tasks":{}}""")
        }
        assertEquals(HttpStatusCode.BadRequest, broken.status)
        assertEquals("""{"success":false,"error":"tasks: expected list"}""", broken.bodyAsText())
    }

    @Test
    fun scheduleExhaustedHeaderAndIcs() = testApplication {
        val deps = newDeps(FakePlanner(listOf(scheduleItem("2026-11-12")), exhausted = true))
        application { ezhModule(deps) }

        val all = client.get("/api/schedule_all?group=PIN&subgroup=0")
        assertEquals(HttpStatusCode.OK, all.status)
        assertEquals("1", all.headers["X-Schedule-Exhausted"])
        assertTrue(deps.syncTimes.needsSync("PIN_0"))

        val ics = client.get("/api/schedule.ics?group=PIN&subgroup=0")
        assertEquals(HttpStatusCode.OK, ics.status)
        assertEquals("text/calendar; charset=utf-8", ics.headers["Content-Type"])
        assertNotNull(ics.headers["Content-Disposition"])
        assertTrue(ics.bodyAsText().contains("BEGIN:VCALENDAR"))
        assertTrue(ics.bodyAsText().contains("SUMMARY:Математика (Лекция)"))
    }

    @Test
    fun backupRateLimitReturns429() = testApplication {
        val deps = newDeps()
        application { ezhModule(deps) }

        val statuses = (1..20).map { client.get("/api/backup").status }
        assertTrue("ожидался 429, были $statuses", HttpStatusCode.TooManyRequests in statuses)
    }
}
