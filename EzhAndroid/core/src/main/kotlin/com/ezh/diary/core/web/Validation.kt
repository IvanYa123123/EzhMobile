package com.ezh.diary.core.web

import java.time.LocalDate
import java.time.format.DateTimeParseException

/** Порт валидаторов из app_data.py: те же тексты ошибок, чтобы клиент их понимал. */
object Validation {
    private val VALID_SUBGROUPS = setOf("0", "1", "2")
    private val GROUP_RE = Regex("^[A-Za-zА-Яа-яЁё0-9/._-]{1,64}$")
    private val LINK_RE = Regex("^(?:https?://|mailto:)[^\\s\"<>]{1,2000}$", RegexOption.IGNORE_CASE)
    private val TIME_RANGE_RE = Regex("^([01]\\d|2[0-3]):[0-5]\\d - ([01]\\d|2[0-3]):[0-5]\\d$")
    private val DATE_RE = Regex("^\\d{4}-\\d{2}-\\d{2}$")

    fun subgroup(raw: String?): String {
        val s = raw?.trim().orEmpty()
        return if (s in VALID_SUBGROUPS) s else "0"
    }

    @Throws(IllegalArgumentException::class)
    fun group(raw: String?): String {
        val s = raw?.trim().orEmpty()
        if (s.isEmpty()) throw IllegalArgumentException("group required")
        if (s.length > 64) throw IllegalArgumentException("group too long")
        if (!GROUP_RE.matches(s)) throw IllegalArgumentException("invalid group format")
        return s
    }

    fun baseDate(raw: String?): String? {
        val s = raw?.trim().orEmpty()
        if (!DATE_RE.matches(s)) return null
        return try {
            LocalDate.parse(s)
            s
        } catch (e: DateTimeParseException) {
            null
        }
    }

    fun timeRange(raw: String?): String? {
        val s = raw?.trim().orEmpty()
        return if (TIME_RANGE_RE.matches(s)) s else null
    }

    /** Некорректная ссылка молча превращается в пустую — как в /api/subjects. */
    fun link(raw: String?): String {
        val s = raw?.trim().orEmpty()
        return if (s.isNotEmpty() && LINK_RE.matches(s)) s else ""
    }
}
