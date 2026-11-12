package com.ezh.diary.core.storage

import java.io.File
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * .sync_times.json: когда последний раз успешно синхронизировали группу.
 * Логика как в app_data.py: синк не чаще раза в 6 часов, если не force.
 */
class SyncTimes(
    private val file: File,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    private val lock = Any()

    fun needsSync(key: String, intervalMs: Long = MIN_SYNC_INTERVAL_MS): Boolean = synchronized(lock) {
        val data = read()
        val last = (data[key] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull() ?: 0.0
        (clock() / 1000.0 - last) > intervalMs / 1000.0
    }

    fun markSynced(key: String) = synchronized(lock) {
        val data = read().toMutableMap()
        data[key] = JsonPrimitive(clock() / 1000.0)
        try {
            writeJsonAtomically(file, JsonObject(data))
        } catch (e: Exception) {
            // Как и Flask-версия: не смогли записать — просто синк повторится позже.
        }
    }

    private fun read(): Map<String, kotlinx.serialization.json.JsonElement> =
        (readJsonElement(file) as? JsonObject) ?: emptyMap()

    companion object {
        const val MIN_SYNC_INTERVAL_MS = 6 * 3600_000L
    }
}
