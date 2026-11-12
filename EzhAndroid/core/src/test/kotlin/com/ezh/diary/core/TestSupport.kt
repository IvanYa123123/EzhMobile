package com.ezh.diary.core

import com.ezh.diary.core.db.JdbcDb
import com.ezh.diary.core.moodle.HttpResult
import com.ezh.diary.core.moodle.MoodleHttp
import com.ezh.diary.core.moodle.MoodleService
import com.ezh.diary.core.planner.PlannerResult
import com.ezh.diary.core.planner.SemesterPlanner
import com.ezh.diary.core.storage.DataFiles
import com.ezh.diary.core.teacher.TeacherService
import com.ezh.diary.core.teacher.TeachersApi
import com.ezh.diary.core.web.ApiDeps
import java.io.File
import kotlin.io.path.createTempDirectory
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Планировщик-заглушка: отдаёт готовый список пар и флаг exhausted. */
class FakePlanner(
    private val items: List<JsonObject> = emptyList(),
    private val exhausted: Boolean = false,
) : SemesterPlanner {
    override fun semester(group: String, targetSubgroup: String) = PlannerResult(items, exhausted)
}

/** Сайт преподавателей-заглушка: отдаёт заданные ответы и считает вызовы. */
class FakeTeachersApi(
    var html: String? = null,
    var ics: String? = null,
) : TeachersApi {
    var htmlCalls: Int = 0
    var icsCalls: Int = 0

    override fun teachersHtml(): String? {
        htmlCalls++
        return html
    }

    override fun ics(slug: String): String? {
        icsCalls++
        return ics
    }
}

/** Moodle-сессия-заглушка: отдаёт заранее заданные ответы по подстроке URL. */
class FakeMoodleHttp : MoodleHttp {
    private data class Route(val urlContains: String, val result: HttpResult)

    private val routes = mutableListOf<Route>()
    val requested = mutableListOf<String>()
    var cookiesMap: Map<String, String> = emptyMap()
    var onRequest: ((String) -> Unit)? = null

    fun on(urlContains: String, text: String = "", status: Int = 200, finalUrl: String? = null) = apply {
        routes += Route(
            urlContains,
            HttpResult(finalUrl ?: "https://do.sevsu.ru/mock", status, text),
        )
    }

    private fun respond(url: String): HttpResult {
        requested += url
        onRequest?.invoke(url)
        return routes.lastOrNull { url.contains(it.urlContains) }?.result
            ?: HttpResult(url, 200, "")
    }

    override fun get(url: String, timeoutSeconds: Int): HttpResult = respond(url)
    override fun postForm(url: String, fields: List<Pair<String, String>>, timeoutSeconds: Int): HttpResult = respond(url)
    override fun postJson(url: String, json: String, timeoutSeconds: Int): HttpResult = respond(url)
    override fun cookies(): Map<String, String> = LinkedHashMap(cookiesMap)
}

fun scheduleItem(
    date: String,
    lesson: String = "Математика",
    timeRange: String = "08:30 - 10:00",
): JsonObject = buildJsonObject {
    put("date", date)
    put("n", 1)
    put("subgroup", "0")
    put("type", 0)
    put("lesson", lesson)
    put("type_name", "Лекция")
    put("time_range", timeRange)
    put("teacher", "Иванов Иван Иванович")
    put("location", "I-101")
}

/** Каталог tests/fixtures репозитория (от каталога модуля при запуске Gradle). */
fun fixturesDir(): File? = listOf("../../tests/fixtures", "../tests/fixtures", "tests/fixtures")
    .map { File(it) }
    .firstOrNull { it.isDirectory }

/** Свежие зависимости на временном каталоге: настоящая SQLite-база, фейковый планировщик. */
fun newDeps(
    planner: SemesterPlanner = FakePlanner(),
    teacherApi: TeachersApi = FakeTeachersApi(),
    moodleHttp: FakeMoodleHttp = FakeMoodleHttp(),
    version: String = "0.8",
): ApiDeps {
    val dir = createTempDirectory("ezh-api-test").toFile()
    val db = JdbcDb("jdbc:sqlite:" + File(dir, "planner.db").absolutePath)
    val files = DataFiles(dir)
    return ApiDeps(
        version,
        db,
        files,
        planner,
        TeacherService(teacherApi, files.teachersFile, files.teacherSchedulesDir),
        MoodleService(
            httpFactory = { moodleHttp },
            cookiesFile = files.moodleCookiesFile,
            cacheFile = files.moodleCacheFile,
            errorLogFile = files.moodleErrorLogFile,
            sleep = {},
            random = { 0.5 },
        ),
    )
}
