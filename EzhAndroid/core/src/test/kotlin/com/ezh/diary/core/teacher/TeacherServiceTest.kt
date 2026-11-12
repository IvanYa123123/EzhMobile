package com.ezh.diary.core.teacher

import com.ezh.diary.core.EzhJson
import com.ezh.diary.core.FakeTeachersApi
import com.ezh.diary.core.fixturesDir
import java.io.File
import java.util.zip.GZIPInputStream
import kotlin.io.path.createTempDirectory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class TeacherServiceTest {
    private val nowMillis = 1_700_000_000_000L

    private fun fixture(name: String): String {
        val dir = assertNotNull(fixturesDir(), "не найден tests/fixtures")
        val file = File(dir, "site/$name")
        return GZIPInputStream(file.inputStream()).bufferedReader(Charsets.UTF_8).readText()
    }

    private fun service(
        api: FakeTeachersApi,
        dir: File,
        background: ((() -> Unit) -> Unit) = {},
    ) = TeacherService(
        api = api,
        teachersFile = File(dir, "teachers.json"),
        schedulesDir = File(dir, "teacher_schedules"),
        clock = { nowMillis },
        background = background,
        sleep = {},
    )

    private fun writeTeachersCache(file: File, ageSeconds: Long, items: List<Teacher>) {
        file.writeText(
            EzhJson.encodeToString(
                kotlinx.serialization.json.JsonElement.serializer(),
                buildJsonObject {
                    put("updated_at", JsonPrimitive(nowMillis / 1000.0 - ageSeconds))
                    put("items", kotlinx.serialization.json.JsonArray(items.map {
                        buildJsonObject {
                            put("name", JsonPrimitive(it.name))
                            put("slug", JsonPrimitive(it.slug))
                        }
                    }))
                },
            ),
        )
    }

    @Test
    fun staleCacheIsReturnedImmediatelyAndRefreshGoesToBackground() {
        val dir = createTempDirectory("teacher-service").toFile()
        val cache = File(dir, "teachers.json")
        val teacher = Teacher("Абаев Евгений Александрович", "abaev-evgenij-aleksandrovich")
        writeTeachersCache(cache, ageSeconds = 2 * 24 * 3600, items = listOf(teacher))
        val api = FakeTeachersApi(html = "<html></html>")
        var backgroundTask: (() -> Unit)? = null

        val items = service(api, dir) { backgroundTask = it }.teachers(force = false)

        assertEquals(listOf(teacher), items)
        assertEquals(0, api.htmlCalls, "без сети не должно быть синхронного запроса")
        assertNotNull(backgroundTask, "обновление должно уйти в фон")
    }

    @Test
    fun freshCacheIsUsedWithoutAnyRequest() {
        val dir = createTempDirectory("teacher-service").toFile()
        val cache = File(dir, "teachers.json")
        val teacher = Teacher("Абаев Евгений Александрович", "abaev-evgenij-aleksandrovich")
        writeTeachersCache(cache, ageSeconds = 60, items = listOf(teacher))
        val api = FakeTeachersApi(html = "<html></html>")
        var backgroundTask: (() -> Unit)? = null

        val items = service(api, dir) { backgroundTask = it }.teachers(force = false)

        assertEquals(listOf(teacher), items)
        assertEquals(0, api.htmlCalls)
        assertEquals(null, backgroundTask)
    }

    @Test
    fun forceFetchesSiteAndRewritesCache() {
        val dir = createTempDirectory("teacher-service").toFile()
        val html = """
            <ul>
              <li><div class="teacher-name">Абаев Евгений Александрович</div>
                  <a href="/teachers/abaev-evgenij-aleksandrovich">Открыть расписание</a></li>
              <li><div>Вакансия УПП</div><a href="/teachers/vakansiya-upp">Открыть расписание</a></li>
            </ul>
        """.trimIndent()
        val api = FakeTeachersApi(html = html)

        val items = service(api, dir).teachers(force = true)

        assertEquals(1, items.size)
        assertEquals("abaev-evgenij-aleksandrovich", items.single().slug)
        assertEquals(1, api.htmlCalls)

        // Повторный вызов без force уже берёт свежий кэш, не дёргая сайт.
        val again = service(api, dir).teachers(force = false)
        assertEquals(items, again)
        assertEquals(1, api.htmlCalls)
        val saved = File(dir, "teachers.json").readText()
        assertTrue(saved.contains("abaev-evgenij-aleksandrovich"))
    }

    @Test
    fun failedFetchKeepsOldCacheEvenWhenForced() {
        val dir = createTempDirectory("teacher-service").toFile()
        val teacher = Teacher("Абаев Евгений Александрович", "abaev-evgenij-aleksandrovich")
        writeTeachersCache(File(dir, "teachers.json"), ageSeconds = 10, items = listOf(teacher))
        val api = FakeTeachersApi(html = null)

        val items = service(api, dir).teachers(force = true)

        assertEquals(listOf(teacher), items)
        assertEquals(1, api.htmlCalls)
    }

    @Test
    fun scheduleUsesFreshCacheWithoutNetwork() {
        val dir = createTempDirectory("teacher-service").toFile()
        val schedules = File(dir, "teacher_schedules").apply { mkdirs() }
        val slug = "abaev-evgenij-aleksandrovich"
        File(schedules, "$slug.ics").writeText(fixture("teacher_${slug}.ics.gz"))
        File(schedules, "$slug.meta.json").writeText(
            """{"updated_at": ${nowMillis / 1000.0}}""",
        )
        val api = FakeTeachersApi()

        val lessons = service(api, dir).schedule(slug, force = false)

        assertEquals(600, lessons.size)
        assertEquals(0, api.icsCalls)
    }

    @Test
    fun scheduleForceDownloadsAndCachesIcs() {
        val dir = createTempDirectory("teacher-service").toFile()
        val slug = "abaev-evgenij-aleksandrovich"
        val api = FakeTeachersApi(ics = fixture("teacher_${slug}.ics.gz"))
        val service = service(api, dir)

        val lessons = service.schedule(slug, force = true)

        assertEquals(600, lessons.size)
        assertEquals(1, api.icsCalls)
        assertTrue(File(dir, "teacher_schedules/$slug.ics").exists())
        assertTrue(File(dir, "teacher_schedules/$slug.meta.json").exists())

        api.ics = null
        assertEquals(600, service.schedule(slug, force = false).size)
    }

    @Test
    fun invalidSlugAndMissingCacheGiveEmptyList() {
        val dir = createTempDirectory("teacher-service").toFile()
        val api = FakeTeachersApi()
        val service = service(api, dir)

        assertEquals(emptyList(), service.schedule("../etc/passwd", force = true))
        assertEquals(emptyList(), service.schedule("", force = false))
        assertEquals(emptyList(), service.schedule("no-cache-teacher", force = false))
        assertEquals(1, api.icsCalls, "валидный slug без кэша — один запрос на сайт")
    }
}
