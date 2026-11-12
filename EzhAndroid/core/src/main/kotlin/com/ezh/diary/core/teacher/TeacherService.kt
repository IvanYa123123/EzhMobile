package com.ezh.diary.core.teacher

import com.ezh.diary.core.EzhJson
import com.ezh.diary.core.storage.writeJsonAtomically
import java.io.File
import java.io.IOException
import kotlin.concurrent.thread
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/**
 * Преподаватели: список с кэшем teachers.json и расписание с кэшем
 * `teacher_schedules/<slug>.ics` + `.meta.json`.
 *
 * Без сети список отдаётся из кэша сразу, а обновление уходит в фон —
 * иначе на телефоне без СевГУ список не открывался вовсе.
 */
class TeacherService(
    private val api: TeachersApi,
    private val teachersFile: File,
    schedulesDir: File,
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val log: (String) -> Unit = {},
    private val background: ((() -> Unit) -> Unit) = { task ->
        thread(isDaemon = true, name = "ezh-teachers-bg") { task() }
    },
    private val sleep: (Long) -> Unit = { millis -> Thread.sleep(millis) },
) {
    private val schedulesDir: File = schedulesDir.apply { mkdirs() }
    private val lock = Any()
    private var teachersRefreshRunning = false
    private var backgroundStarted = false

    /** Список преподавателей; [force] — синхронно сходить на сайт. */
    fun teachers(force: Boolean): List<Teacher> {
        val cache = readTeachersCache()
        val cached = cache?.let { cleanTeachers(it.items) }.orEmpty()
        if (cache != null && !force && nowSeconds() - cache.updatedAt < TEACHERS_LIST_TTL) {
            return cached
        }
        if (cached.isNotEmpty() && !force) {
            startTeachersRefresh()
            return cached
        }
        val fetched = cleanTeachers(fetchTeachers())
        if (fetched.isNotEmpty()) {
            writeTeachersCache(fetched)
            return fetched
        }
        return cached
    }

    /** Расписание преподавателя; [force] — игнорировать свежий кэш. */
    fun schedule(slugRaw: String?, force: Boolean): List<TeacherLesson> {
        val slug = validateSlug(slugRaw) ?: return emptyList()
        val icsFile = File(schedulesDir, "$slug.ics")
        val metaFile = File(schedulesDir, "$slug.meta.json")

        if (!force) {
            val cached = readScheduleCache(icsFile, metaFile)
            if (cached != null && cached.ageSeconds < TEACHER_SCHEDULE_TTL) return cached.lessons
        }

        val fresh = api.ics(slug)
        if (fresh != null) {
            val lessons = IcsParser.parse(fresh)
            if (lessons.isNotEmpty()) {
                writeTextAtomically(icsFile, fresh)
                writeMeta(metaFile)
                return lessons
            }
            log("[teacher_ics] $slug: ICS пустой после парсинга")
        }
        return readScheduleCache(icsFile, metaFile)?.lessons ?: emptyList()
    }

    /** Фоновый прогрев устаревших расписаний (раз в [intervalSeconds]). */
    fun startBackgroundRefresh(
        intervalSeconds: Long = BACKGROUND_REFRESH_INTERVAL,
        startupDelaySeconds: Long = BACKGROUND_REFRESH_STARTUP_DELAY,
    ) {
        synchronized(lock) {
            if (backgroundStarted) return
            backgroundStarted = true
        }
        background {
            sleep(startupDelaySeconds * 1000)
            while (true) {
                try {
                    refreshStaleBatch()
                } catch (e: Exception) {
                    log("[teacher_bg] ${e.message}")
                }
                sleep(intervalSeconds * 1000)
            }
        }
    }

    private fun startTeachersRefresh() {
        synchronized(lock) {
            if (teachersRefreshRunning) return
            teachersRefreshRunning = true
        }
        background {
            try {
                val fetched = cleanTeachers(fetchTeachers())
                if (fetched.isNotEmpty()) writeTeachersCache(fetched)
            } catch (e: Exception) {
                log("[teachers] background refresh failed: ${e.message}")
            } finally {
                synchronized(lock) { teachersRefreshRunning = false }
            }
        }
    }

    /** Обновляет не больше 30 устаревших .ics — остальные догрузятся в следующий заход. */
    private fun refreshStaleBatch() {
        val files = schedulesDir.listFiles { file -> file.isFile && file.name.endsWith(".ics") }
            ?: return
        if (files.isEmpty()) return

        val stale = files.mapNotNull { file ->
            val slug = file.name.removeSuffix(".ics")
            if (isScheduleStale(slug)) slug else null
        }.take(BACKGROUND_REFRESH_BATCH)
        if (stale.isEmpty()) return

        for (slug in stale) {
            try {
                schedule(slug, force = true)
            } catch (e: Exception) {
                log("[teacher_bg] $slug: ${e.message}")
            }
            sleep(1500)
        }
    }

    private fun isScheduleStale(slug: String): Boolean {
        val metaFile = File(schedulesDir, "$slug.meta.json")
        return try {
            val meta = EzhJson.parseToJsonElement(metaFile.readText()).jsonObject
            val ts = (meta["updated_at"] as? JsonPrimitive)?.doubleOrNull ?: 0.0
            nowSeconds() - ts > TEACHER_SCHEDULE_TTL
        } catch (e: Exception) {
            true
        }
    }

    private fun fetchTeachers(): List<Teacher> = TeacherParser.parse(api.teachersHtml())

    private fun cleanTeachers(items: List<Teacher>): List<Teacher> =
        items.filter { it.slug.isNotEmpty() && isPersonName(it.name) }

    private fun readTeachersCache(): TeachersCache? {
        if (!teachersFile.exists()) return null
        return try {
            val root = EzhJson.parseToJsonElement(teachersFile.readText()).jsonObject
            val updatedAt = (root["updated_at"] as? JsonPrimitive)?.doubleOrNull ?: 0.0
            val items = (root["items"] as? JsonArray).orEmpty().mapNotNull { element ->
                val item = element as? JsonObject ?: return@mapNotNull null
                val name = (item["name"] as? JsonPrimitive)?.contentOrNull.orEmpty()
                val slug = (item["slug"] as? JsonPrimitive)?.contentOrNull.orEmpty()
                if (slug.isEmpty()) null else Teacher(name, slug)
            }
            TeachersCache(updatedAt, items)
        } catch (e: Exception) {
            null
        }
    }

    private fun writeTeachersCache(items: List<Teacher>) {
        try {
            writeJsonAtomically(
                teachersFile,
                buildJsonObject {
                    put("updated_at", JsonPrimitive(nowSeconds()))
                    put("items", JsonArray(items.map {
                        buildJsonObject {
                            put("name", JsonPrimitive(it.name))
                            put("slug", JsonPrimitive(it.slug))
                        }
                    }))
                },
                pretty = true,
            )
        } catch (e: Exception) {
            log("[teachers] cache write failed: ${e.message}")
        }
    }

    private fun readScheduleCache(icsFile: File, metaFile: File): CachedSchedule? {
        val text = try {
            icsFile.readText(Charsets.UTF_8)
        } catch (e: IOException) {
            return null
        }
        val lessons = IcsParser.parse(text)
        if (lessons.isEmpty()) return null

        // Без .meta.json кэш считается старым: заодно не падаем на битом meta.
        var ageSeconds = Double.POSITIVE_INFINITY
        try {
            val meta = EzhJson.parseToJsonElement(metaFile.readText()).jsonObject
            val ts = (meta["updated_at"] as? JsonPrimitive)?.doubleOrNull ?: 0.0
            ageSeconds = nowSeconds() - ts
        } catch (e: Exception) {
            // meta отсутствует или битая — возраст остаётся бесконечным
        }
        return CachedSchedule(lessons, ageSeconds)
    }

    private fun writeMeta(file: File) {
        try {
            writeJsonAtomically(
                file,
                buildJsonObject { put("updated_at", JsonPrimitive(nowSeconds())) },
            )
        } catch (e: Exception) {
            log("[teacher_ics] meta write failed: ${e.message}")
        }
    }

    private fun writeTextAtomically(file: File, text: String) {
        try {
            val tmp = File(file.path + ".tmp")
            tmp.writeText(text, Charsets.UTF_8)
            if (!tmp.renameTo(file)) {
                file.delete()
                if (!tmp.renameTo(file)) throw IOException("не удалось заменить $file")
            }
        } catch (e: IOException) {
            log("[teacher_ics] write failed: ${e.message}")
        }
    }

    private fun nowSeconds(): Double = clock() / 1000.0

    private data class TeachersCache(val updatedAt: Double, val items: List<Teacher>)

    private data class CachedSchedule(val lessons: List<TeacherLesson>, val ageSeconds: Double)

    companion object {
        const val TEACHERS_LIST_TTL = 24 * 3600.0
        const val TEACHER_SCHEDULE_TTL = 6 * 3600.0
        const val BACKGROUND_REFRESH_INTERVAL = 6 * 3600L
        const val BACKGROUND_REFRESH_STARTUP_DELAY = 600L
        const val BACKGROUND_REFRESH_BATCH = 30
    }
}
