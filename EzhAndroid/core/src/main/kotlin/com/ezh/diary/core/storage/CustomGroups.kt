package com.ezh.diary.core.storage

import java.io.File
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** custom_groups.json: пользовательские группы, которые добавляются к списку из Group.txt. */
class CustomGroups(private val file: File) {
    fun load(): List<String> {
        val element = readJsonElement(file) as? JsonArray ?: return emptyList()
        return element.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
    }

    fun save(groups: List<String>): Boolean = try {
        writeJsonAtomically(file, JsonArray(groups.map { JsonPrimitive(it) }), pretty = true)
        true
    } catch (e: Exception) {
        false
    }
}
