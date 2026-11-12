package com.ezh.diary.core

import com.ezh.diary.core.db.JdbcDb
import com.ezh.diary.core.planner.PlannerResult
import com.ezh.diary.core.planner.SemesterPlanner
import com.ezh.diary.core.storage.DataFiles
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

/** Свежие зависимости на временном каталоге: настоящая SQLite-база, фейковый планировщик. */
fun newDeps(planner: SemesterPlanner = FakePlanner(), version: String = "0.8"): ApiDeps {
    val dir = createTempDirectory("ezh-api-test").toFile()
    val db = JdbcDb("jdbc:sqlite:" + File(dir, "planner.db").absolutePath)
    return ApiDeps(version, db, DataFiles(dir), planner)
}
