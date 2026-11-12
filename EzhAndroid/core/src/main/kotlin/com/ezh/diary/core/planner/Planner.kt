package com.ezh.diary.core.planner

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

data class PlannerResult(val schedule: List<JsonObject>, val exhausted: Boolean)

/**
 * Сборка семестра по неделям — порт `planner.SevSUPlanner.get_semester_schedule`.
 *
 * Логика намеренно повторяет Python один в один, потому что от неё зависит
 * содержимое golden-контракта:
 *  • targetSubgroup == "0" — отдаём все подгруппы, иначе только свою и «общие»
 *    занятия с subgroup == "0";
 *  • пропущенные внутри семестра недели дозаполняются шаблоном той же чётности
 *    (берётся самая длинная неделя), но только до последней реальной недели;
 *  • при экстраполяции отбрасываются даты вне сезона и праздники/январь/лето;
 *  • общий бюджет загрузки 22 секунды, резерв 8 — при нехватке времени
 *    возвращается exhausted = true.
 */
class Planner(
    private val api: ScheduleApi,
    private val nowNanos: () -> Long = System::nanoTime,
) {
    val timeMap: Map<Int, String> = mapOf(
        1 to "08:30 - 10:00",
        2 to "10:10 - 11:40",
        3 to "11:50 - 13:20",
        4 to "14:00 - 15:30",
        5 to "15:40 - 17:10",
        6 to "17:20 - 18:50",
        7 to "19:00 - 20:30",
        8 to "20:40 - 22:10",
    )

    val typeMap: Map<Int, String> = mapOf(
        0 to "Лекция",
        1 to "ЛЗ",
        2 to "ПЗ",
        3 to "Экзамен/Зачет",
    )

    private val holidays: Set<Pair<Int, Int>> = buildSet {
        (1..8).forEach { add(1 to it) }
        addAll(listOf(2 to 23, 3 to 8, 5 to 1, 5 to 9, 6 to 12, 11 to 4))
    }

    fun semesterSchedule(
        groupVariant: String,
        targetSubgroup: String = "0",
        maxWeeks: Int = 25,
        budgetSeconds: Double = 22.0,
    ): PlannerResult {
        val weeksData = fetchWeeks(groupVariant, maxWeeks, budgetSeconds)
        val schedule = mutableListOf<JsonObject>()

        var oddTemplate: List<JsonObject>? = null
        var oddTemplateWeek = 0
        var oddTemplateLen = 0
        var evenTemplate: List<JsonObject>? = null
        var evenTemplateWeek = 0
        var evenTemplateLen = 0

        val lastRealWeek = (1..maxWeeks).filter { !weeksData.schedule[it].isNullOrEmpty() }
            .maxOrNull() ?: 0
        val targetIsAll = targetSubgroup == "0"

        for (week in 1..maxWeeks) {
            val weekData = weeksData.schedule[week].orEmpty()
            if (weekData.isNotEmpty()) {
                val processed = weekData.mapNotNull { item ->
                    val subgroup = item["subgroup"]?.let { (it as? JsonPrimitive)?.contentOrNull } ?: "0"
                    if (targetIsAll || subgroup == "0" || subgroup == targetSubgroup) {
                        decorate(item)
                    } else {
                        null
                    }
                }
                schedule += processed

                if (week % 2 != 0) {
                    if (processed.size > oddTemplateLen) {
                        oddTemplate = processed
                        oddTemplateWeek = week
                        oddTemplateLen = processed.size
                    }
                } else if (processed.size > evenTemplateLen) {
                    evenTemplate = processed
                    evenTemplateWeek = week
                    evenTemplateLen = processed.size
                }
            } else if (week < lastRealWeek) {
                val template = if (week % 2 != 0) oddTemplate else evenTemplate
                val templateWeek = if (week % 2 != 0) oddTemplateWeek else evenTemplateWeek
                if (template != null && template.isNotEmpty()) {
                    val diffWeeks = week - templateWeek
                    for (item in template) {
                        val extrapolated = extrapolate(item, diffWeeks)
                        if (extrapolated != null) schedule += extrapolated
                    }
                }
            }
        }

        return PlannerResult(schedule, weeksData.exhausted)
    }

    private fun decorate(item: JsonObject): JsonObject {
        val n = item["n"]?.let { (it as? JsonPrimitive)?.intOrNull }
        val type = item["type"]?.let { (it as? JsonPrimitive)?.intOrNull }
        return JsonObject(
            item + mapOf(
                "time_range" to JsonPrimitive(timeMap[n] ?: ""),
                "type_name" to JsonPrimitive(typeMap[type] ?: "Занятие"),
            ),
        )
    }

    /** null — элемент отбрасывается (дата вне сезона или нерабочий день). */
    private fun extrapolate(item: JsonObject, diffWeeks: Int): JsonObject? {
        val dateValue = item["date"] ?: return item
        val dateStr = (dateValue as? JsonPrimitive)?.contentOrNull?.substringBefore("T") ?: return item
        val origDate = try {
            LocalDate.parse(dateStr, LENIENT_DATE)
        } catch (e: Exception) {
            return item
        }
        val newDate = origDate.plusDays(diffWeeks.toLong() * 7)
        val origSeason = season(origDate.monthValue)
        val newSeason = season(newDate.monthValue)
        if (origSeason == 0 || origSeason != newSeason) return null
        if (!isValidStudyDay(newDate)) return null
        return JsonObject(item + ("date" to JsonPrimitive(newDate.toString())))
    }

    private fun season(month: Int): Int = when (month) {
        in 9..12 -> 1
        in 2..6 -> 2
        else -> 0
    }

    private fun isValidStudyDay(date: LocalDate): Boolean {
        if (date.monthValue in setOf(1, 7, 8)) return false
        return (date.monthValue to date.dayOfMonth) !in holidays
    }

    private class WeeksResult(
        val schedule: Map<Int, List<JsonObject>>,
        val exhausted: Boolean,
    )

    private fun fetchWeeks(groupVariant: String, maxWeeks: Int, budgetSeconds: Double): WeeksResult {
        val start = nowNanos()
        val result = LinkedHashMap<Int, List<JsonObject>>()
        var exhausted = false
        for (week in 1..maxWeeks) {
            val elapsed = (nowNanos() - start) / 1e9
            if (elapsed + RESERVE_SECONDS > budgetSeconds) {
                exhausted = true
                break
            }
            result[week] = api.week(groupVariant, week)
        }
        return WeeksResult(result, exhausted)
    }

    companion object {
        private const val RESERVE_SECONDS = 8.0
        private val LENIENT_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-M-d")
    }
}
