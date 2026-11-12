package com.ezh.diary.core.storage

import java.io.File
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.JsonPrimitive

/**
 * Кэш семестра в schedules/<hash>.json.
 *
 * Защита от «обрезки» повторяет _save_schedule_cache: если новый массив
 * короче старого более чем на 10%, не перезаписываем — иначе временный сбой
 * сайта затрёт полное расписание неполным.
 */
class ScheduleCache(private val log: (String) -> Unit = {}) {
    fun read(file: File): List<JsonObject>? {
        val array = readJsonElement(file) as? JsonArray ?: return null
        return array.filterIsInstance<JsonObject>()
    }

    fun save(file: File, schedule: List<JsonObject>): Boolean {
        if (schedule.isEmpty()) return true
        val old = read(file)
        if (old != null && old.isNotEmpty() && schedule.size < old.size * 0.9) {
            val oldMax = old.mapNotNull { dateOf(it) }.maxOrNull().orEmpty()
            val newMax = schedule.mapNotNull { dateOf(it) }.maxOrNull().orEmpty()
            val shrinks = !(newMax.isNotEmpty() && oldMax.isNotEmpty() && newMax < oldMax)
            if (shrinks) {
                log("[schedule_cache] защита: получено ${schedule.size}, в кэше ${old.size} — оставляю кэш")
                return false
            }
        }
        file.parentFile?.mkdirs()
        return try {
            writeJsonAtomically(file, JsonArray(schedule))
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun dateOf(item: JsonObject): String? =
        (item["date"] as? JsonPrimitive)?.contentOrNull
}
