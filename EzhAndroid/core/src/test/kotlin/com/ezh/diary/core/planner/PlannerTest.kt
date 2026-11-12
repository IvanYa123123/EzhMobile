package com.ezh.diary.core.planner

import java.io.File
import java.util.zip.GZIPInputStream
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlannerTest {
    @Test
    fun semesterMatchesFlaskVersion() {
        for (subgroup in listOf("0", "1")) {
            val golden = fixtureJson("golden/semester_pin_sub$subgroup.json") as JsonObject
            val expected = golden["schedule"] as JsonArray

            val planner = Planner(FixtureApi("schedule_pin-b-24-2-o"))
            val result = planner.semesterSchedule("ПИН/б-24-2-о", subgroup)

            assertEquals("subgroup=$subgroup: количество пар", expected.size, result.schedule.size)
            assertEquals("subgroup=$subgroup: содержимое", expected, JsonArray(result.schedule))
            assertEquals("subgroup=$subgroup: exhausted", false, result.exhausted)
        }
    }

    @Test
    fun budgetExhaustionStopsFetching() {
        var calls = 0
        var nanos = 0L
        val api = ScheduleApi { _, _ ->
            calls++
            emptyList()
        }
        // Каждый вызов часов прибавляет 3 с: 4 недели успевают, на 5-й бюджет исчерпан.
        val planner = Planner(api) {
            nanos.also { nanos += 3_000_000_000L }
        }

        val result = planner.semesterSchedule("любая", maxWeeks = 25, budgetSeconds = 22.0)

        assertTrue(result.exhausted)
        assertEquals(4, calls)
        assertTrue(result.schedule.isEmpty())
    }

    private class FixtureApi(private val prefix: String) : ScheduleApi {
        override fun week(group: String, week: Int): List<JsonObject> {
            val name = prefix + "_w" + week.toString().padStart(2, '0') + ".json.gz"
            val file = File(fixturesDir(), "site/" + name)
            if (!file.exists()) return emptyList()
            val text = GZIPInputStream(file.inputStream()).bufferedReader().readText()
            val root = Json.parseToJsonElement(text) as JsonObject
            return (root["schedule"] as? JsonArray)?.filterIsInstance<JsonObject>() ?: emptyList()
        }
    }

    private fun fixtureJson(relativePath: String): kotlinx.serialization.json.JsonElement =
        Json.parseToJsonElement(File(fixturesDir(), relativePath).readText())

    companion object {
        /** :core:test запускается из каталога модуля (EzhAndroid/core). */
        private fun fixturesDir(): File {
            val moduleDir = File("").absoluteFile
            val candidates = listOf(
                File(moduleDir, "../../tests/fixtures"),
                File(moduleDir, "../tests/fixtures"),
                File(moduleDir, "tests/fixtures"),
            )
            return candidates.firstOrNull { it.isDirectory }
                ?: error("каталог tests/fixtures не найден; искали: " + candidates)
        }
    }
}
