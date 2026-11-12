package com.ezh.diary.core.web

import com.ezh.diary.core.db.Task
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.JsonObject

/**
 * Генерация .ics — точный порт _generate_tasks_ics и /api/schedule.ics.
 * Строки складываются по 75 байт UTF-8, продолжение начинается с пробела:
 * иначе часть календарей ломает кириллицу.
 */
object Ics {
    private val TASK_STATUS = mapOf(
        "green" to "Обычная",
        "orange" to "Важная",
        "red" to "Срочная",
        "completed" to "Выполнено",
    )
    private val DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd")
    private val STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC)

    fun escape(value: String?): String = (value ?: "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r", "")
        .replace("\n", "\\n")

    fun utcStamp(now: LocalDateTime = LocalDateTime.now(ZoneOffset.UTC)): String = STAMP.format(now)

    /** DTSTAMP из epoch-миллисекунд — чтобы тесты были детерминированными. */
    fun utcStampAt(epochMillis: Long): String =
        STAMP.format(LocalDateTime.ofEpochSecond(epochMillis / 1000, 0, ZoneOffset.UTC))

    fun fold(line: String, limit: Int = 75): String {
        if (line.isEmpty()) return line
        if (utf8Size(line) <= limit) return line
        val parts = ArrayList<String>()
        val current = StringBuilder()
        var currentBytes = 0
        var currentLimit = limit
        var index = 0
        while (index < line.length) {
            val codePoint = line.codePointAt(index)
            val symbol = String(Character.toChars(codePoint))
            index += Character.charCount(codePoint)
            val symbolBytes = utf8Size(symbol)
            if (currentBytes + symbolBytes > currentLimit) {
                parts += current.toString()
                current.setLength(0)
                current.append(' ')
                currentBytes = 1
                currentLimit = limit - 1
            }
            current.append(symbol)
            currentBytes += symbolBytes
        }
        if (current.isNotEmpty()) parts += current.toString()
        return parts.joinToString("\r\n")
    }

    fun tasksIcs(tasks: List<Task>, dtstamp: String = utcStamp()): String {
        val lines = mutableListOf(
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Ezh Dnevnik//Tasks//RU",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:Заметки EZHednevnik",
        )
        for (task in tasks) {
            val date = task.date.trim()
            val text = task.text.trim()
            if (date.isEmpty() || text.isEmpty()) continue
            val day = try {
                LocalDate.parse(date, DATE)
            } catch (e: Exception) {
                continue
            }
            val status = task.status.ifEmpty { "green" }
            val uid = md5Of("task|$date|$text").take(16)
            lines += "BEGIN:VEVENT"
            lines += "UID:$uid@ezh-dnevnik"
            lines += "DTSTAMP:$dtstamp"
            lines += "DTSTART;VALUE=DATE:${day.format(DateTimeFormatter.BASIC_ISO_DATE)}"
            lines += "DTEND;VALUE=DATE:${day.plusDays(1).format(DateTimeFormatter.BASIC_ISO_DATE)}"
            lines += "SUMMARY:${escape(text)}"
            lines += "CATEGORIES:${escape(TASK_STATUS[status] ?: status)}"
            lines += "X-EZHEDNEVNIK-STATUS:${escape(status)}"
            lines += if (status == "completed") "STATUS:COMPLETED" else "STATUS:NEEDS-ACTION"
            lines += "TRANSP:TRANSPARENT"
            if (status == "completed") lines += "PERCENT-COMPLETE:100"
            lines += "END:VEVENT"
        }
        lines += "END:VCALENDAR"
        return lines.joinToString("\r\n") { fold(it) } + "\r\n"
    }

    fun scheduleIcs(
        group: String,
        subgroup: String,
        schedule: List<JsonObject>,
        dtstamp: String = utcStamp(),
    ): String {
        val lines = mutableListOf(
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//EzhMobile//EzhDiary//RU",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
        )
        for (item in schedule) {
            val date = item.text("date")
            val range = item.text("time_range")
            val lesson = item.text("lesson")
            val typeName = item.text("type_name")
            val teacher = item.text("teacher")
            val location = item.text("location")
            if (date.isEmpty() || !range.contains(" - ")) continue
            val parts = range.split(" - ")
            val start = parseDateTime(date, parts[0].trim()) ?: continue
            val end = parseDateTime(date, parts[1].trim()) ?: continue
            val uid = md5Of("${group}_${date}_${item.text("n")}_${item.text("subgroup")}_$lesson").take(16)
            val summary = lesson + if (typeName.isNotEmpty()) " ($typeName)" else ""
            val description = buildList {
                if (teacher.isNotEmpty()) add("Преподаватель: $teacher")
                if (location.isNotEmpty()) add("Аудитория: $location")
            }.joinToString("\n")
            lines += "BEGIN:VEVENT"
            lines += "UID:$uid@ezh.local"
            lines += "DTSTAMP:$dtstamp"
            lines += "DTSTART:${start.format(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss"))}"
            lines += "DTEND:${end.format(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss"))}"
            lines += "SUMMARY:${escape(summary)}"
            lines += "DESCRIPTION:${escape(description)}"
            lines += "LOCATION:${escape(location)}"
            lines += "END:VEVENT"
        }
        lines += "END:VCALENDAR"
        return lines.joinToString("\r\n") { fold(it) } + "\r\n"
    }

    /** Flask: filename*=UTF-8''quote(filename) — пробелы как %20, не '+'. */
    fun attachmentsHeader(group: String, subgroup: String): String {
        val filename = "schedule_${com.ezh.diary.core.storage.makeSafeFilename(group)}_$subgroup.ics"
        val encoded = URLEncoder.encode(filename, "UTF-8").replace("+", "%20")
        return "attachment; filename*=UTF-8''$encoded"
    }

    private fun parseDateTime(date: String, time: String): LocalDateTime? = try {
        val (y, m, d) = date.split("-").map { it.toInt() }
        val (hh, mm) = time.split(":").map { it.toInt() }
        LocalDateTime.of(y, m, d, hh, mm)
    } catch (e: Exception) {
        null
    }

    private fun utf8Size(text: String): Int = text.toByteArray(Charsets.UTF_8).size

    private fun md5Of(text: String): String =
        com.ezh.diary.core.storage.md5Hex(text)
}
