package com.ezh.diary.core.planner

/**
 * То, что нужно HTTP-слою от планировщика. Отдельный интерфейс позволяет
 * в тестах подставлять заранее собранный семестр вместо сети.
 */
interface SemesterPlanner {
    fun semester(group: String, targetSubgroup: String = "0"): PlannerResult
}
