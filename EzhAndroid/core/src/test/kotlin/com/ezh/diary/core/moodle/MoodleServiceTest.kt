package com.ezh.diary.core.moodle

import com.ezh.diary.core.EzhJson
import com.ezh.diary.core.FakeMoodleHttp
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread
import kotlin.io.path.createTempDirectory
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MoodleServiceTest {
    private fun newService(
        http: FakeMoodleHttp = FakeMoodleHttp(),
        dir: File = createTempDirectory("ezh-moodle-test").toFile(),
        clock: () -> Long = { 1_700_000_000_000L },
    ): Pair<MoodleService, File> {
        val service = MoodleService(
            httpFactory = { http },
            cookiesFile = File(dir, "moodle_cookies.json"),
            cacheFile = File(dir, "moodle_stats_cache.json"),
            errorLogFile = File(dir, "moodle_errors.log"),
            clock = clock,
            random = { 0.5 },
            sleep = {},
        )
        return service to dir
    }

    private fun writeCookies(dir: File) {
        File(dir, "moodle_cookies.json").writeText("""{"MoodleSession":"abc"}""", Charsets.UTF_8)
    }

    private fun statsHtml(): String = """
        <html><body>
        <script>M.cfg = {"sesskey":"secret"};</script>
        </body></html>
    """.trimIndent()

    private fun courseList(): String = """
        [{"error":false,"data":{"courses":[
          {"id":101,"fullname":"Математика"},
          {"id":102,"fullname":"Физика"}
        ]}}]
    """.trimIndent()

    private fun calendar(): String = """
        [{"error":false,"data":{"events":[
          {"modulename":"assign","instance":5001,"timesort":1790000000}
        ]}}]
    """.trimIndent()

    private fun gradebook(): String = """
        <table><tr>
          <td><a href="/mod/assign/view.php?id=5001">Контрольная</a></td>
          <td>5</td>
        </tr></table>
    """.trimIndent()

    private fun courseMath(): String = """
        <html><body>
        <a href="/mod/assign/view.php?id=5001">Контрольная Задание</a>
        <a href="/mod/quiz/view.php?id=5002">Опрос Тест</a>
        </body></html>
    """.trimIndent()

    private fun coursePhysics(): String = """
        <html><body>
        <a href="/mod/assign/view.php?id=5003">Лабораторная Задание</a>
        </body></html>
    """.trimIndent()

    private fun scrapyHttp(): FakeMoodleHttp = FakeMoodleHttp()
        .on("/my/", statsHtml())
        .on("classification", courseList())
        .on("action_events_by_courses", calendar())
        .on("grade/report/overview", gradebook())
        .on("course/view.php?id=101", courseMath())
        .on("course/view.php?id=102", coursePhysics())
        .on("assign/view.php?id=5003", "<html>submissionstatussubmitted <th>Оценка</th><td>4 / 5</td></html>")

    @Test
    fun statusWithoutCookiesIsFalseWithoutRequests() {
        val http = FakeMoodleHttp()
        val (service, _) = newService(http)
        assertFalse(service.status())
        assertTrue(http.requested.isEmpty())
    }

    @Test
    fun statusDropsExpiredCookies() {
        val http = FakeMoodleHttp().on("/my/", finalUrl = "https://auth.sevsu.ru/login")
        val (service, dir) = newService(http)
        writeCookies(dir)

        assertFalse(service.status())
        assertFalse(File(dir, "moodle_cookies.json").exists())
    }

    @Test
    fun loginSavesCookiesAndClearsCache() {
        val http = FakeMoodleHttp()
            .on("/login/index.php", """<a href="/auth/oauth2/login.php?id=1&amp;wantsurl=%2Fmy%2F">СевГУ</a>""")
            .on("auth/oauth2/login.php", """<form action="https://auth.sevsu.ru/sso/login-actions/auth"><input name="execution" value="x"></form>""")
            .on("sso/login-actions/auth", finalUrl = "https://do.sevsu.ru/my/")
        http.cookiesMap = mapOf("MoodleSession" to "saved", "auth" to "token")
        val (service, dir) = newService(http)
        File(dir, "moodle_stats_cache.json").writeText("{}", Charsets.UTF_8)

        val result = service.login("user", "pass")

        assertTrue(result is LoginResult.Success)
        val cookies = EzhJson.parseToJsonElement(File(dir, "moodle_cookies.json").readText()).jsonObject
        assertEquals("saved", cookies["MoodleSession"]!!.jsonPrimitive.content)
        assertEquals("token", cookies["auth"]!!.jsonPrimitive.content)
        assertFalse(File(dir, "moodle_stats_cache.json").exists())
    }

    @Test
    fun loginWrongPasswordReturns401() {
        val http = FakeMoodleHttp()
            .on("/login/index.php", """<a href="/auth/oauth2/login.php">СевГУ</a>""")
            .on("auth/oauth2/login.php", """<form action="https://auth.sevsu.ru/sso/login"><input name="execution" value="x"></form>""")
            .on("sso/login", finalUrl = "https://auth.sevsu.ru/sso/login?error=1")
        val (service, _) = newService(http)

        val result = service.login("user", "wrong")

        assertTrue(result is LoginResult.Failure)
        assertEquals(401, (result as LoginResult.Failure).status)
        assertEquals("Неверный логин или пароль", result.message)
    }

    @Test
    fun loginWithoutSsoButtonReturns500() {
        val http = FakeMoodleHttp().on("/login/index.php", "<html>no button</html>")
        val (service, _) = newService(http)

        val result = service.login("user", "pass")

        assertTrue(result is LoginResult.Failure)
        assertEquals(500, (result as LoginResult.Failure).status)
        assertEquals("Не нашли кнопку входа через СевГУ", result.message)
    }

    @Test
    fun statsScrapesCoursesAssignmentsAndWarnings() {
        val http = scrapyHttp()
        val (service, dir) = newService(http)

        val result = service.stats(force = true)

        assertTrue(result is StatsResult.Ok)
        val ok = result as StatsResult.Ok
        assertTrue(ok.warnings.toString(), ok.warnings.isEmpty())
        assertEquals(1_700_000_000.0, ok.timestamp, 0.001)

        assertEquals(2, ok.data.size)
        val math = ok.data[0]
        assertEquals("101", math.id)
        assertEquals(2, math.assignments.size)

        val graded = math.assignments[0]
        assertEquals("5001", graded.id)
        assertEquals("Контрольная", graded.name)
        assertEquals("Сдано", graded.status)
        assertEquals("5", graded.grade)
        assertEquals(5.0, graded.gradeNum!!, 0.001)
        assertTrue(graded.dueIso.isNotEmpty())

        val quiz = math.assignments[1]
        assertEquals("Опрос", quiz.name)
        assertEquals("Тест", quiz.status)
        assertEquals("—", quiz.grade)

        val physics = ok.data[1].assignments[0]
        assertEquals("На проверке", physics.status)
        assertEquals("4/5", physics.grade)
        assertEquals(4.0, physics.gradeNum!!, 0.001)

        val cache = EzhJson.parseToJsonElement(File(dir, "moodle_stats_cache.json").readText()).jsonObject
        assertEquals(1_700_000_000.0, cache["timestamp"]!!.jsonPrimitive.content.toDouble(), 0.001)
        assertNotNull(cache["data"])
    }

    @Test
    fun statsReturnsCacheWithoutRequestsWhenNotForced() {
        val http = scrapyHttp()
        val (service, dir) = newService(http)
        File(dir, "moodle_stats_cache.json").writeText(
            """{"timestamp":1000.0,"data":[],"warnings":["старое предупреждение"]}""",
            Charsets.UTF_8,
        )

        val result = service.stats(force = false)

        assertTrue(result is StatsResult.Ok)
        val ok = result as StatsResult.Ok
        assertEquals(1000.0, ok.timestamp, 0.001)
        assertEquals(listOf("старое предупреждение"), ok.warnings)
        assertTrue(http.requested.isEmpty())
    }

    @Test
    fun statsExpiredSessionReturns401AndClearsCookies() {
        val http = FakeMoodleHttp().on("/my/", finalUrl = "https://auth.sevsu.ru/login")
        val (service, dir) = newService(http)
        writeCookies(dir)

        val result = service.stats(force = true)

        assertTrue(result is StatsResult.Failure)
        assertEquals(401, (result as StatsResult.Failure).status)
        assertFalse(File(dir, "moodle_cookies.json").exists())
    }

    @Test
    fun statsReportsUnparsedGradebookAsWarning() {
        val http = FakeMoodleHttp()
            .on("/my/", statsHtml())
            .on("classification", courseList())
            .on("action_events_by_courses", calendar())
            .on("grade/report/overview", """<html><a href="/mod/assign/view.php?id=1">x</a></html>""")
            .on("course/view.php", """<html><a href="/mod/quiz/view.php?id=9">Опрос</a></html>""")
        val (service, _) = newService(http)

        val result = service.stats(force = true)

        assertTrue(result is StatsResult.Ok)
        assertTrue((result as StatsResult.Ok).warnings.any { it.contains("Ведомость оценок не распознана") })
    }

    @Test
    fun statsCancelReturns499() {
        val http = scrapyHttp()
        val (service, _) = newService(http)
        lateinit var running: MoodleService
        http.onRequest = { url ->
            if (url.contains("course/view.php")) running.cancel()
        }
        running = service

        val result = service.stats(force = true)

        assertTrue(result is StatsResult.Failure)
        val failure = result as StatsResult.Failure
        assertEquals(failure.message, 499, failure.status)
    }

    @Test
    fun secondConcurrentScrapeReturns429WithoutCache() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val http = scrapyHttp()
        http.onRequest = { url ->
            if (url.contains("course/view.php")) {
                entered.countDown()
                release.await(5, TimeUnit.SECONDS)
            }
        }
        val (service, _) = newService(http)
        val first = AtomicReference<StatsResult?>(null)
        val worker = thread {
            first.set(service.stats(force = true))
        }

        assertTrue(entered.await(5, TimeUnit.SECONDS))
        val second = service.stats(force = true)
        release.countDown()
        worker.join(5000)

        assertTrue(second is StatsResult.Failure)
        val secondFailure = second as StatsResult.Failure
        val firstMessage = (first.get() as? StatsResult.Failure)?.message ?: ""
        assertEquals("first=$firstMessage; second=${secondFailure.message}", 429, secondFailure.status)
        assertTrue(first.get() is StatsResult.Ok)
    }
}
