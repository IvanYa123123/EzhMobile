package com.ezh.diary.core.teacher

import com.ezh.diary.core.fixturesDir
import java.io.File
import java.util.zip.GZIPInputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class TeacherParserTest {
    private fun fixture(name: String): String {
        val dir = assertNotNull(fixturesDir(), "не найден tests/fixtures")
        val file = File(dir, "site/$name")
        assertTrue(file.exists(), "нет фикстуры $file")
        return GZIPInputStream(file.inputStream()).bufferedReader(Charsets.UTF_8).readText()
    }

    @Test
    fun parsesTeachersFromSitePage() {
        val teachers = TeacherParser.parse(fixture("teachers.html.gz"))

        assertEquals(1008, teachers.size)
        assertTrue(teachers.all { it.slug.isNotEmpty() })
        assertEquals(teachers.size, teachers.map { it.slug }.distinct().size)

        val abaev = teachers.first { it.slug == "abaev-evgenij-aleksandrovich" }
        assertEquals("Абаев Евгений Александрович", abaev.name)

        assertTrue(teachers.all { isPersonName(it.name) }, "в списке остались не-ФИО")
        assertFalse(teachers.any { it.slug == "vakansiya-upp" }, "вакансия попала в список")
        assertTrue(teachers.all { it.name.length >= 3 })
    }

    @Test
    fun keepsTeachersWithVacancyPrefix() {
        // «2 - доц - внеш - Исаев» — настоящий человек, терять его нельзя.
        assertTrue(isPersonName("2 - доц - внеш - Исаев"))
        assertTrue(isPersonName("2026 вакансия - ИТС - асс- 1 - ОМР - Ушаков"))
    }

    @Test
    fun rejectsNonPersonLines() {
        assertFalse(isPersonName("Вакансия УПП"))
        assertFalse(isPersonName("0 - ОМР"))
        assertFalse(isPersonName("5 - внеш"))
        assertFalse(isPersonName("1 - внутр"))
        assertFalse(isPersonName(""))
        assertFalse(isPersonName(null))
    }

    @Test
    fun ignoresButtonAndEmptyInput() {
        assertTrue(looksLikeButtonText("Открыть расписание"))
        assertTrue(looksLikeButtonText("расписание"))
        assertFalse(looksLikeButtonText("Абаев Евгений Александрович"))
        assertEquals(emptyList(), TeacherParser.parse(null))
        assertEquals(emptyList(), TeacherParser.parse(""))
        assertEquals(emptyList(), TeacherParser.parse("<html><body>нет ссылок</body></html>"))
    }
}
