package com.ezh.diary.core.storage

import com.ezh.diary.core.EzhJson
import java.io.File
import java.io.IOException
import kotlinx.serialization.json.JsonElement

private val PRETTY = kotlinx.serialization.json.Json(EzhJson) {
    prettyPrint = true
    prettyPrintIndent = "  "
}

/**
 * Атомарная запись JSON: сначала во временный файл, потом os.replace.
 * Так же делала Flask-версия, чтобы не оставить полузаписанный файл.
 */
@Throws(IOException::class)
fun writeJsonAtomically(file: File, value: JsonElement, pretty: Boolean = false) {
    file.parentFile?.mkdirs()
    val tmp = File(file.path + ".tmp")
    val text = if (pretty) PRETTY.encodeToString(JsonElement.serializer(), value)
    else EzhJson.encodeToString(JsonElement.serializer(), value)
    tmp.writeText(text, Charsets.UTF_8)
    if (!tmp.renameTo(file)) {
        // renameTo не перезаписывает существующий файл на всех ОС — удаляем и пробуем ещё раз.
        file.delete()
        if (!tmp.renameTo(file)) {
            tmp.delete()
            throw IOException("не удалось заменить $file")
        }
    }
}

fun readJsonElement(file: File): JsonElement? = try {
    EzhJson.parseToJsonElement(file.readText(Charsets.UTF_8))
} catch (e: Exception) {
    null
}
