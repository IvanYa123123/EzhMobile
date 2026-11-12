package com.ezh.diary.core.moodle

import com.ezh.diary.core.EzhJson
import java.io.File
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.PosixFilePermissions
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Date
import java.util.concurrent.Semaphore
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import org.jsoup.Jsoup

@Serializable
data class MoodleAssignment(
    val id: String,
    val type: String,
    val name: String,
    val status: String,
    val grade: String,
    val due: String = "",
    @SerialName("due_iso") val dueIso: String = "",
    @SerialName("grade_num") val gradeNum: Double? = null,
)

@Serializable
data class MoodleCourse(
    val id: String,
    val name: String,
    val assignments: List<MoodleAssignment>,
)

sealed class LoginResult {
    object Success : LoginResult()
    data class Failure(val status: Int, val message: String) : LoginResult()
}

sealed class StatsResult {
    data class Ok(
        val data: List<MoodleCourse>,
        val timestamp: Double,
        val warnings: List<String>,
    ) : StatsResult()

    data class Failure(val status: Int, val message: String) : StatsResult()
}

/** Moodle-кэш на диске: формат совпадает с moodle_stats_cache.json Flask-версии. */
@Serializable
private data class CachedStats(
    val timestamp: Double = 0.0,
    val data: List<MoodleCourse> = emptyList(),
    val warnings: List<String> = emptyList(),
)

private data class CourseRef(val id: String, val name: String)
private data class Deadline(val due: String, val dueIso: String)
private data class GradeInfo(val status: String, val grade: String, val gradeNum: Double?)

/**
 * Порт moodle_pro.py: SSO-вход через auth.sevsu.ru, сбор курсов/заданий/оценок.
 *
 * Cookies — фактически пароль от учётной записи, поэтому файл пишется
 * с правами 0600 (п.3 §11). Ошибки парсинга больше не теряются молча:
 * они попадают в [StatsResult.Ok.warnings] (п.6 §11).
 */
class MoodleService(
    private val httpFactory: (Map<String, String>) -> MoodleHttp,
    private val cookiesFile: File,
    private val cacheFile: File,
    private val errorLogFile: File,
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val random: () -> Double = { Math.random() },
    private val sleep: (Long) -> Unit = { millis -> Thread.sleep(millis) },
    private val log: (String) -> Unit = {},
) {
    private val lock = Semaphore(1)
    private val cancelFlag = AtomicBoolean(false)

    fun status(): Boolean {
        if (!cookiesFile.exists()) return false
        return try {
            val result = session().get("$MOODLE_URL/my/", timeoutSeconds = 10)
            if (result.url.contains("auth.sevsu.ru") || result.url.contains("login/index.php")) {
                clearCookies()
                false
            } else {
                true
            }
        } catch (e: Exception) {
            logError("status check failed", exc = e)
            false
        }
    }

    fun login(username: String?, password: String?): LoginResult {
        if (username.isNullOrEmpty() || password.isNullOrEmpty()) {
            return LoginResult.Failure(400, "Введите логин и пароль")
        }
        val http = httpFactory(emptyMap())
        return try {
            val loginPage = http.get("$MOODLE_URL/login/index.php", 15)
            val sso = SSO_LINK.find(loginPage.text)
            if (sso == null) {
                regexMiss("login: SSO button link", SSO_LINK.pattern)
                return LoginResult.Failure(500, "Не нашли кнопку входа через СевГУ")
            }
            val ssoUrl = sso.groupValues[1].replace("&amp;", "&")
            val ssoPage = http.get(ssoUrl, 15)

            val form = FORM_ACTION.find(ssoPage.text)
            if (form == null) {
                regexMiss("login: Keycloak form action", FORM_ACTION.pattern)
                return LoginResult.Failure(500, "Не нашли форму Keycloak")
            }
            var formAction = form.groupValues[1].replace("&amp;", "&")
            if (formAction.startsWith("/")) formAction = "https://auth.sevsu.ru$formAction"

            val fields = LinkedHashMap<String, String>()
            INPUT_RE.findAll(ssoPage.text).forEach { fields[it.groupValues[1]] = it.groupValues[2] }
            fields["username"] = username
            fields["password"] = password
            if (!fields.containsKey("credentialId")) fields["credentialId"] = ""

            val result = http.postForm(formAction, fields.map { it.key to it.value }, 15)
            if (result.url.contains("auth.sevsu.ru")) {
                return LoginResult.Failure(401, "Неверный логин или пароль")
            }

            writePrivateJson(cookiesFile, mapToJson(http.cookies()))
            cacheFile.delete()
            LoginResult.Success
        } catch (e: Exception) {
            logError("login failed", exc = e)
            LoginResult.Failure(500, e.message ?: "Ошибка входа")
        }
    }

    fun logout() {
        cookiesFile.delete()
        cacheFile.delete()
    }

    fun cancel() {
        cancelFlag.set(true)
    }

    fun stats(force: Boolean): StatsResult {
        val cached = readCache()
        if (!force && cached != null) {
            return StatsResult.Ok(cached.data, cached.timestamp, cached.warnings)
        }
        if (!lock.tryAcquire()) {
            return if (cached != null) {
                StatsResult.Ok(cached.data, cached.timestamp, cached.warnings)
            } else {
                StatsResult.Failure(429, "Обновление уже выполняется, подождите")
            }
        }
        cancelFlag.set(false)
        val warnings = mutableListOf<String>()

        try {
            val http = session()
            val my = http.get("$MOODLE_URL/my/", 15)
            if (my.url.contains("auth.sevsu.ru")) {
                clearCookies()
                return StatsResult.Failure(401, "Сессия устарела")
            }

            val sesskey = SESSKEY.find(my.text)?.groupValues?.get(1).orEmpty()

            // --- 1. Список курсов ---
            val courses = mutableListOf<CourseRef>()
            if (sesskey.isNotEmpty()) {
                val apiUrl = "$MOODLE_URL/lib/ajax/service.php?sesskey=$sesskey&info=" +
                    "core_course_get_enrolled_courses_by_timeline_classification"
                val payload = """[{"index":0,"methodname":"""".trimIndent() +
                    "core_course_get_enrolled_courses_by_timeline_classification" +
                    """"","args":{"offset":0,"limit":0,"classification":"all","sort":"fullname"}}]"""
                try {
                    val response = http.postJson(apiUrl, payload, 15)
                    courses += parseCourseList(response.text)
                } catch (e: Exception) {
                    logError("stats: AJAX course list failed", exc = e)
                    warnings += "Список курсов получен запасным способом — часть данных может отсутствовать."
                }
            }

            if (courses.isEmpty()) {
                for (match in COURSE_LINK.findAll(my.text)) {
                    val cid = match.groupValues[1]
                    val name = cleanHtml(match.groupValues[2])
                    if (name.length > 3 && courses.none { it.id == cid }) {
                        courses += CourseRef(cid, name)
                    }
                }
            }

            if (courses.isEmpty()) {
                warnings += "Не удалось получить список курсов Moodle — возможно, изменилась вёрстка."
                return StatsResult.Ok(emptyList(), nowSeconds(), warnings)
            }

            // --- 2. Дедлайны из Календаря ---
            val deadlines = HashMap<String, Deadline>()
            if (sesskey.isNotEmpty()) {
                val courseIds = courses.mapNotNull { it.id.toIntOrNull() }
                if (courseIds.isNotEmpty()) {
                    val apiUrl = "$MOODLE_URL/lib/ajax/service.php?sesskey=$sesskey&info=" +
                        "core_calendar_get_action_events_by_courses"
                    val payload = """[{"index":0,"methodname":"core_calendar_get_action_events_by_courses",""" +
                        """"args":{"courseids":[${courseIds.joinToString(",")}],"limitnum":100}}]"""
                    try {
                        val response = http.postJson(apiUrl, payload, 15)
                        parseCalendarDeadlines(response.text, deadlines)
                    } catch (e: Exception) {
                        logError("stats: Calendar API failed", exc = e)
                        warnings += "Дедлайны не загружены: календарь Moodle недоступен."
                    }
                }
            }

            // --- 3. Ведомость оценок ---
            val gradebook = HashMap<String, GradeInfo>()
            val gradePage = http.get("$MOODLE_URL/grade/report/overview/index.php", 20)
            if (gradePage.url.contains("auth.sevsu.ru")) {
                warnings += "Оценки не загружены: сессия Moodle истекла."
            } else {
                gradebook.putAll(parseGradebook(gradePage.text))
                if (gradebook.isEmpty() && gradePage.text.contains("/mod/assign/view.php")) {
                    warnings += "Ведомость оценок не распознана — возможно, изменилась вёрстка Moodle."
                }
            }

            // --- 4. Гибридный сбор ---
            val result = mutableListOf<MoodleCourse>()
            for (course in courses) {
                if (cancelFlag.get()) return StatsResult.Failure(499, "Cancelled")

                val assignments = mutableListOf<MoodleAssignment>()
                val coursePage = http.get("$MOODLE_URL/course/view.php?id=${course.id}", 15)
                randomSleep()
                if (cancelFlag.get()) return StatsResult.Failure(499, "Cancelled")
                if (coursePage.url.contains("auth.sevsu.ru")) {
                    if (warnings.none { it == SESSION_EXPIRED_COURSES }) warnings += SESSION_EXPIRED_COURSES
                    continue
                }

                val seen = HashSet<String>()
                for (match in ACT_LINK.findAll(coursePage.text)) {
                    val modType = match.groupValues[1].lowercase()
                    val modId = match.groupValues[2]
                    var actName = cleanHtml(match.groupValues[3])
                    actName = actName.replace(TYPE_SUFFIX, "")

                    if (actName.isEmpty() || !seen.add(modId)) continue

                    val deadline = deadlines[modId]
                    var status = "—"
                    var grade = "—"
                    var gradeNum: Double? = null

                    if (modType == "assign") {
                        val fromGradebook = gradebook[modId]
                        if (fromGradebook != null) {
                            status = fromGradebook.status
                            grade = fromGradebook.grade
                            gradeNum = fromGradebook.gradeNum
                        } else {
                            if (cancelFlag.get()) return StatsResult.Failure(499, "Cancelled")
                            randomSleep()
                            val assignPage = http.get("$MOODLE_URL/mod/assign/view.php?id=$modId", 15)
                            if (cancelFlag.get()) return StatsResult.Failure(499, "Cancelled")

                            status = assignmentStatus(assignPage.text)
                            val gradeMatch = GRADE_CELL.find(assignPage.text)
                            if (gradeMatch != null) {
                                val text = cleanHtml(gradeMatch.groupValues[1])
                                    .replace("&nbsp;", " ")
                                    .replace(" ", "")
                                if (DIGITS.containsMatchIn(text)) {
                                    if (text.contains('/')) {
                                        val parts = text.split('/')
                                        val num1 = parts[0].split(',')[0].replace(".", "")
                                        val num2 = parts[1].split(',')[0]
                                        grade = "$num1/$num2"
                                        gradeNum = num1.toDoubleOrNull()
                                    } else {
                                        grade = text
                                        gradeNum = Regex("(\\d+)").find(text)?.groupValues?.get(1)?.toDoubleOrNull()
                                    }
                                }
                            }
                        }
                    } else {
                        status = "Тест"
                    }

                    assignments += MoodleAssignment(
                        id = modId,
                        type = modType,
                        name = actName,
                        status = status,
                        grade = grade,
                        due = deadline?.due.orEmpty(),
                        dueIso = deadline?.dueIso.orEmpty(),
                        gradeNum = gradeNum,
                    )
                }

                if (assignments.isNotEmpty()) {
                    result += MoodleCourse(id = course.id, name = course.name, assignments = assignments)
                }
            }

            val timestamp = nowSeconds()
            writeCache(timestamp, result, warnings)
            return StatsResult.Ok(result, timestamp, warnings)
        } catch (e: Exception) {
            logError("stats: unhandled exception", exc = e)
            return StatsResult.Failure(500, e.message ?: "Ошибка")
        } finally {
            lock.release()
        }
    }

    private fun session(): MoodleHttp = httpFactory(readCookies())

    private fun readCookies(): Map<String, String> {
        if (!cookiesFile.exists()) return emptyMap()
        return try {
            val root = EzhJson.parseToJsonElement(cookiesFile.readText(Charsets.UTF_8)).jsonObject
            root.mapNotNull { (name, value) ->
                val text = (value as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
                name to text
            }.toMap()
        } catch (e: Exception) {
            logError("failed to load cookies", exc = e)
            emptyMap()
        }
    }

    private fun clearCookies() {
        try {
            if (cookiesFile.exists()) cookiesFile.delete()
        } catch (e: Exception) {
            logError("failed to remove cookies file", exc = e)
        }
    }

    private fun readCache(): CachedStats? {
        if (!cacheFile.exists()) return null
        return try {
            EzhJson.decodeFromString(CachedStats.serializer(), cacheFile.readText(Charsets.UTF_8))
        } catch (e: Exception) {
            logError("failed to read stats cache", exc = e)
            null
        }
    }

    private fun writeCache(timestamp: Double, data: List<MoodleCourse>, warnings: List<String>) {
        try {
            writePrivateJson(
                cacheFile,
                EzhJson.encodeToJsonElement(
                    CachedStats.serializer(),
                    CachedStats(timestamp = timestamp, data = data, warnings = warnings),
                ),
            )
        } catch (e: Exception) {
            logError("stats: failed to write cache", exc = e)
        }
    }

    private fun parseCourseList(responseText: String): List<CourseRef> {
        val root = try {
            EzhJson.parseToJsonElement(responseText).jsonArray
        } catch (e: Exception) {
            throw IllegalArgumentException("AJAX ответ не JSON", e)
        }
        val first = root.firstOrNull()?.jsonObject ?: return emptyList()
        if (first["error"]?.let { (it as? JsonPrimitive)?.booleanOrNull == true } == true) return emptyList()
        val courses = first["data"]?.jsonObject?.get("courses")?.jsonArray ?: return emptyList()
        return courses.mapNotNull { element ->
            val course = element as? JsonObject ?: return@mapNotNull null
            val id = (course["id"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            val name = (course["fullname"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            CourseRef(id, name)
        }
    }

    private fun parseCalendarDeadlines(responseText: String, into: MutableMap<String, Deadline>) {
        val root = EzhJson.parseToJsonElement(responseText).jsonArray
        val first = root.firstOrNull()?.jsonObject ?: return
        if (first["error"]?.let { (it as? JsonPrimitive)?.booleanOrNull == true } == true) return
        val events = first["data"]?.jsonObject?.get("events")?.jsonArray ?: return
        for (element in events) {
            val event = element as? JsonObject ?: continue
            if ((event["modulename"] as? JsonPrimitive)?.contentOrNull != "assign") continue
            val instance = (event["instance"] as? JsonPrimitive)?.contentOrNull
                ?: (event["instance"] as? JsonPrimitive)?.intOrNull?.toString()
                ?: continue
            val timesort = (event["timesort"] as? JsonPrimitive)?.longOrNull ?: continue
            val date = Instant.ofEpochSecond(timesort).atZone(ZoneId.systemDefault())
            into[instance] = Deadline(
                due = date.format(DateTimeFormatter.ofPattern("dd.MM.uuuu")),
                dueIso = date.format(DateTimeFormatter.ISO_LOCAL_DATE),
            )
        }
    }

    /** Порт _parse_gradebook_bs4: строки таблицы с ссылками на задания. */
    private fun parseGradebook(html: String): Map<String, GradeInfo> {
        val document = Jsoup.parse(html)
        val result = LinkedHashMap<String, GradeInfo>()
        for (row in document.select("tr")) {
            val link = row.select("a[href]").firstOrNull { ASSIGN_LINK.containsMatchIn(it.attr("href")) }
                ?: continue
            val id = ASSIGN_LINK.find(link.attr("href"))?.groupValues?.get(1) ?: continue
            val name = cleanHtml(link.text())

            var gradeText = "—"
            var gradeNum: Double? = null
            for (cell in row.select("td").reversed()) {
                val clean = cleanHtml(cell.text())
                if (clean.isEmpty()) continue
                if (CYRILLIC.containsMatchIn(clean) && !DIGITS.containsMatchIn(clean)) continue
                if (clean == "-") continue
                val number = NUMBER.find(clean)
                if (number != null) {
                    gradeText = clean.replace(',', '.')
                    gradeNum = number.groupValues[1].replace(',', '.').toDoubleOrNull()
                    break
                }
            }
            result[id] = GradeInfo(
                status = if (gradeNum != null) "Сдано" else "Не сдано",
                grade = gradeText,
                gradeNum = gradeNum,
            )
        }
        return result
    }

    private fun assignmentStatus(page: String): String = when {
        page.contains("submissiongraded") || page.contains("Оценено") -> "Сдано"
        page.contains("submissionstatussubmitted") || page.contains("Отправлено для оценивания") -> "На проверке"
        page.contains("submissionstatusnotsubmitted") || page.contains("Не сдано") -> "Не сдано"
        page.contains("Черновик") -> "Черновик"
        else -> "Ожидает"
    }

    private fun cleanHtml(text: String): String =
        text.replace(TAG_RE, " ").replace(WHITESPACE_RE, " ").trim()

    private fun randomSleep() {
        sleep((400 + random() * 400).toLong())
    }

    private fun regexMiss(context: String, pattern: String) {
        logError("regex miss: $context", extra = "pattern=${pattern.take(100)}")
    }

    private fun logError(context: String, extra: String = "", exc: Exception? = null) {
        val message = runCatching {
            val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.ROOT).format(Date(clock()))
            buildString {
                append("\n[$stamp] $context\n")
                if (extra.isNotEmpty()) append("  extra: $extra\n")
                if (exc != null) {
                    append("  ${exc.javaClass.simpleName}: ${exc.message}\n")
                    append(exc.stackTraceToString())
                }
            }
        }.getOrNull() ?: return
        log(message.trim())
        try {
            errorLogFile.parentFile?.mkdirs()
            errorLogFile.appendText(message, Charsets.UTF_8)
            makeOwnerOnly(errorLogFile)
        } catch (_: Exception) {
            // Лог не должен ломать запрос.
        }
    }

    private fun writePrivateJson(file: File, payload: JsonElement) {
        file.parentFile?.mkdirs()
        val tmp = File(file.path + ".tmp")
        tmp.writeText(EzhJson.encodeToString(JsonElement.serializer(), payload), Charsets.UTF_8)
        makeOwnerOnly(tmp)
        try {
            Files.move(
                tmp.toPath(),
                file.toPath(),
                StandardCopyOption.REPLACE_EXISTING,
                StandardCopyOption.ATOMIC_MOVE,
            )
        } catch (_: Exception) {
            Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
        makeOwnerOnly(file)
    }

    private fun makeOwnerOnly(file: File) {
        try {
            Files.setPosixFilePermissions(
                Paths.get(file.absolutePath),
                PosixFilePermissions.fromString("rw-------"),
            )
        } catch (_: Exception) {
            // Windows/не-POSIX ФС: правами управляет ОС.
        }
    }

    private fun mapToJson(values: Map<String, String>): JsonObject = buildJsonObject {
        values.forEach { (key, value) -> put(key, JsonPrimitive(value)) }
    }

    private fun nowSeconds(): Double = clock() / 1000.0

    companion object {
        const val MOODLE_URL = "https://do.sevsu.ru"

        private const val SESSION_EXPIRED_COURSES = "Часть курсов не удалось загрузить: сессия Moodle истекла."

        private val SSO_LINK = Regex("""href="([^"]*auth/oauth2/login\.php[^"]*)"""")
        private val FORM_ACTION = Regex("""<form[^>]+action="([^"]+)"""")
        private val INPUT_RE = Regex("""<input[^>]+name="([^"]+)"[^>]*value="([^"]*)"""")
        private val SESSKEY = Regex(""""sesskey":"([^"]+)"""")
        private val COURSE_LINK = Regex(
            """<a[^>]+href="[^"]*?/course/view\.php\?id=(\d+)"[^>]*>(.*?)</a>""",
            setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        )
        private val ACT_LINK = Regex(
            """<a[^>]+href="[^"]*?/mod/(assign|quiz)/view\.php\?id=(\d+)"[^>]*>(.*?)</a>""",
            setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        )
        private val TYPE_SUFFIX = Regex("""\s+(Задание|Тест)$""", RegexOption.IGNORE_CASE)
        private val GRADE_CELL = Regex(
            """Оценка</th>\s*<td[^>]*>(.*?)</td>""",
            setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
        )
        private val ASSIGN_LINK = Regex("""/mod/assign/view\.php\?id=(\d+)""")
        private val NUMBER = Regex("""(\d+(?:[.,]\d+)?)""")
        private val DIGITS = Regex("""\d""")
        private val CYRILLIC = Regex("""[а-яА-Я]""")
        private val TAG_RE = Regex("""<[^>]+>""")
        private val WHITESPACE_RE = Regex("""\s+""")
    }
}
