package com.ezh.diary.core.storage

import java.io.File
import java.security.MessageDigest

/**
 * Пути к пользовательским данным (BASE_DIR из Flask-версии).
 *
 * На телефоне root — filesDir приложения, в JVM-тестах — временный каталог.
 * Group.txt/VERSION/static живут рядом с APK (BUNDLE_DIR) и сюда не входят:
 * их подключает Android-обвязка на этапе 7.
 */
class DataFiles(rootDir: File) {
    val root: File = rootDir
    val dbFile: File get() = File(root, "planner.db")
    val schedulesDir: File get() = File(root, "schedules")
    val syncTimesFile: File get() = File(root, ".sync_times.json")
    val customGroupsFile: File get() = File(root, "custom_groups.json")
    val teachersFile: File get() = File(root, "teachers.json")
    val teacherSchedulesDir: File get() = File(root, "teacher_schedules")

    fun ensure() {
        root.mkdirs()
        schedulesDir.mkdirs()
    }

    /** Повторяет _schedule_cache_path: имя без опасных символов + md5(group\\0subgroup). */
    fun scheduleCacheFile(group: String, subgroup: String): File {
        val digest = md5Hex("$group\u0000$subgroup").take(16)
        return File(schedulesDir, "${makeSafeFilename(group)}_${subgroup}_$digest.json")
    }
}

private val FORBIDDEN = "/\\:*?\"<>|".toSet()

/** Порт make_safe_filename: «..» нельзя, пробелы/точки по краям обрезаются. */
fun makeSafeFilename(name: String): String = name
    .map { ch -> if (ch in FORBIDDEN) '_' else ch }
    .joinToString("")
    .replace("..", "__")
    .trim(' ', '.')
    .take(120)

fun md5Hex(text: String): String =
    MessageDigest.getInstance("MD5")
        .digest(text.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
