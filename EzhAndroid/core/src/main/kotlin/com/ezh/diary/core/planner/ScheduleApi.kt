package com.ezh.diary.core.planner

import kotlinx.serialization.json.JsonObject

/**
 * Источник расписания. В проде — HTTP-API сайта, в тестах — фикстуры.
 * Возвращает сырые элементы ответа: их поля (включая slug'и) прокидываются
 * в итоговое расписание как есть, как это делает Flask-версия.
 */
fun interface ScheduleApi {
    fun week(group: String, week: Int): List<JsonObject>
}
