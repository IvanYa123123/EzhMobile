package com.ezh.diary.core.teacher

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle

/** Одна пара из ICS-календаря преподавателя. */
data class TeacherLesson(
    val date: String,
    val n: Int,
    val timeRange: String,
    val lesson: String,
    val typeName: String,
    val location: String,
    val groups: List<String>,
)

/**
 * Парсер ICS со страницы /calendar/teacher/<slug>.
 *
 * Сайт отдаёт обычный ICS: SUMMARY вида «Системное программирование (Лекция)»,
 * LOCATION «I-420», DESCRIPTION с группами. Раскладку повторов делаем как в
 * Flask-версии — без icalendar, чтобы не тянуть библиотеку в APK.
 */
object IcsParser {
    private val EVENT_RE = Regex("BEGIN:VEVENT(.*?)END:VEVENT", RegexOption.DOT_MATCHES_ALL)
    private val DATE_TIME_RE = Regex("^(\\d{8})T(\\d{6})Z?$")
    private val DATE_RE = Regex("^(\\d{8})$")
    private val DATE_TIME_FORMAT = DateTimeFormatter
        .ofPattern("uuuuMMddHHmmss")
        .withResolverStyle(ResolverStyle.STRICT)
    private val DATE_FORMAT = DateTimeFormatter
        .ofPattern("uuuuMMdd")
        .withResolverStyle(ResolverStyle.STRICT)

    private val TYPE_PATTERNS = listOf(
        Regex("\\bлек(?:ция|\\.)?\\b", RegexOption.IGNORE_CASE) to "Лекция",
        Regex("\\bпз\\b|\\bпрак", RegexOption.IGNORE_CASE) to "ПЗ",
        Regex("\\bлз\\b|\\bлаб", RegexOption.IGNORE_CASE) to "ЛЗ",
        Regex("\\bзач", RegexOption.IGNORE_CASE) to "Зачёт",
        Regex("\\bэкз", RegexOption.IGNORE_CASE) to "Экзамен",
        Regex("\\bсем", RegexOption.IGNORE_CASE) to "Семинар",
    )

    private val TIME_TO_PAIR = mapOf(
        (8 to 30) to 1,
        (10 to 10) to 2,
        (11 to 50) to 3,
        (13 to 50) to 3,
        (14 to 0) to 4,
        (15 to 20) to 4,
        (15 to 40) to 5,
        (17 to 20) to 6,
        (19 to 0) to 7,
        (20 to 40) to 8,
    )

    private val GROUP_IN_DESC_RE = Regex(
        "(?:групп[аы]?|groups?)\\s*[:\\-—]?\\s*([^\\n]+)",
        RegexOption.IGNORE_CASE,
    )
    private val GROUP_NAME_RE = Regex("[А-Яа-яЁёA-Za-z]{2,5}/[а-яa-z]?-?\\d{2}-\\d-о[\\p{L}\\p{N}_\\-]*")

    fun parse(ics: String?): List<TeacherLesson> {
        if (ics.isNullOrEmpty() || "BEGIN:VCALENDAR" !in ics) return emptyList()
        return splitEvents(ics).mapNotNull(::parseEvent).sortedWith(compareBy({ it.date }, { it.n }))
    }

    private fun splitEvents(ics: String): List<String> {
        val text = ics.replace("\r\n", "\n").replace("\r", "\n").replace(Regex("\n[ \t]"), "")
        return EVENT_RE.findAll(text).map { it.groupValues[1] }.toList()
    }

    private fun unfold(value: String): String = value
        .replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")

    private fun field(block: String, name: String): String {
        val match = Regex("^$name(?:;[^:\\n]+)?:(.*)$", setOf(RegexOption.MULTILINE))
            .find(block) ?: return ""
        return unfold(match.groupValues[1].trim())
    }

    private fun parseDateTime(value: String): LocalDateTime? {
        val text = value.trim()
        if (text.isEmpty()) return null
        DATE_TIME_RE.matchEntire(text)?.let { match ->
            return try {
                LocalDateTime.parse(match.groupValues[1] + match.groupValues[2], DATE_TIME_FORMAT)
            } catch (e: Exception) {
                null
            }
        }
        DATE_RE.matchEntire(text)?.let { match ->
            return try {
                LocalDate.parse(match.groupValues[1], DATE_FORMAT).atStartOfDay()
            } catch (e: Exception) {
                null
            }
        }
        return null
    }

    private fun pairNumber(hour: Int, minute: Int): Int = TIME_TO_PAIR[hour to minute] ?: 0

    private fun parseEvent(block: String): TeacherLesson? {
        val start = parseDateTime(field(block, "DTSTART")) ?: return null
        val end = parseDateTime(field(block, "DTEND")) ?: return null

        val summary = field(block, "SUMMARY")
        val location = field(block, "LOCATION")
        val description = field(block, "DESCRIPTION")
        val (lesson, typeName, groups) = parseSummary(summary, description)

        return TeacherLesson(
            date = start.toLocalDate().toString(),
            n = pairNumber(start.hour, start.minute),
            timeRange = start.format(TIME_FORMAT) + " - " + end.format(TIME_FORMAT),
            lesson = lesson.ifEmpty { summary },
            typeName = typeName,
            location = location,
            groups = groups,
        )
    }

    private fun parseSummary(summaryRaw: String, descriptionRaw: String): Triple<String, String, List<String>> {
        val summary = summaryRaw.trim()
        val description = descriptionRaw.trim()
        var lesson = summary
        var typeName = ""

        val withParens = Regex("^(.*?)\\s*\\(([^()]+)\\)\\s*$", RegexOption.DOT_MATCHES_ALL).find(summary)
        if (withParens != null) {
            val inner = withParens.groupValues[2].trim()
            val isType = TYPE_PATTERNS.any { (pattern, _) -> pattern.containsMatchIn(inner) }
            val shortType = inner.lowercase() in setOf(
                "лекция", "лз", "пз", "семинар", "зачёт", "экзамен", "лек.", "лаб.", "практ.",
            )
            if (isType || shortType) {
                lesson = withParens.groupValues[1].trim()
                typeName = inner.split(",")[0].trim()
            }
        }

        if (typeName.isEmpty()) {
            Regex("^(.*?),\\s*([^,]+)$", RegexOption.DOT_MATCHES_ALL).find(summary)?.let { match ->
                val candidate = match.groupValues[2].trim()
                if (TYPE_PATTERNS.any { (pattern, _) -> pattern.containsMatchIn(candidate) }) {
                    lesson = match.groupValues[1].trim()
                    typeName = candidate
                }
            }
        }

        if (typeName.isEmpty()) {
            Regex(
                "^(Лекция|ПЗ|ЛЗ|Семинар|Зачёт|Экзамен)\\.?\\s*[:\\-—]?\\s*(.+)$",
                RegexOption.IGNORE_CASE,
            ).matchEntire(summary)?.let { match ->
                typeName = match.groupValues[1].trim()
                lesson = match.groupValues[2].trim()
            }
        }

        if (typeName.isEmpty()) {
            for ((pattern, label) in TYPE_PATTERNS) {
                if (pattern.containsMatchIn(summary)) {
                    typeName = label
                    lesson = pattern.replace(lesson, "").trim(' ', ',', '.', ';', '-', '—')
                    break
                }
            }
        }

        return Triple(lesson, typeName, extractGroups(description, summary))
    }

    private fun extractGroups(description: String, summary: String): List<String> {
        val text = description + "\n" + summary
        GROUP_IN_DESC_RE.find(text)?.let { match ->
            return match.groupValues[1].trim()
                .split(Regex("[,;]"))
                .map { it.trim() }
                .filter { it.isNotEmpty() }
        }
        return GROUP_NAME_RE.findAll(text).map { it.value }.distinct().toList()
    }

    private val TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm")
}
