package com.ezh.diary.core.teacher

import com.ezh.diary.core.fixturesDir
import java.io.File
import java.util.zip.GZIPInputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class IcsParserTest {
    private fun fixture(name: String): String {
        val dir = assertNotNull(fixturesDir(), "не найден tests/fixtures")
        val file = File(dir, "site/$name")
        assertTrue(file.exists(), "нет фикстуры $file")
        return GZIPInputStream(file.inputStream()).bufferedReader(Charsets.UTF_8).readText()
    }

    @Test
    fun parsesTeacherCalendar() {
        val lessons = IcsParser.parse(fixture("teacher_abaev-evgenij-aleksandrovich.ics.gz"))

        assertEquals(600, lessons.size)
        assertEquals(lessons.sortedWith(compareBy({ it.date }, { it.n })), lessons)

        val first = lessons.first()
        assertEquals("2025-09-05", first.date)
        assertEquals(2, first.n)
        assertEquals("10:10 - 11:40", first.timeRange)

        assertTrue(lessons.all { Regex("\\d{4}-\\d{2}-\\d{2}").matches(it.date) })
        assertTrue(lessons.all { Regex("\\d{2}:\\d{2} - \\d{2}:\\d{2}").matches(it.timeRange) })
        assertTrue(lessons.all { it.n in 1..8 })
        assertTrue(lessons.all { it.lesson.isNotBlank() })
        assertTrue(lessons.all { it.typeName.isNotBlank() })
        assertTrue(lessons.all { it.location.isNotBlank() })
        assertTrue(lessons.all { it.groups.isNotEmpty() })
    }

    @Test
    fun handlesEmptyAndBrokenInput() {
        assertEquals(emptyList(), IcsParser.parse(null))
        assertEquals(emptyList(), IcsParser.parse(""))
        assertEquals(emptyList(), IcsParser.parse("не календарь"))
        assertEquals(emptyList(), IcsParser.parse("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"))
    }

    @Test
    fun parsesSummaryTypeAndGroups() {
        val ics = """
            BEGIN:VCALENDAR
            BEGIN:VEVENT
            DTSTART:20260907T083000
            DTEND:20260907T100000
            SUMMARY:Физика (ПЗ)
            LOCATION:I-101
            DESCRIPTION:Группа: ИВТ/б-24-1-о
            END:VEVENT
            END:VCALENDAR
        """.trimIndent()

        val lesson = IcsParser.parse(ics).single()
        assertEquals("Физика", lesson.lesson)
        assertEquals("ПЗ", lesson.typeName)
        assertEquals(1, lesson.n)
        assertEquals("08:30 - 10:00", lesson.timeRange)
        assertEquals(listOf("ИВТ/б-24-1-о"), lesson.groups)
        assertEquals("I-101", lesson.location)
    }
}
