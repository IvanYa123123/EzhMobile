package com.ezh.diary

import android.content.Context
import com.ezh.diary.core.storage.DataFiles
import com.ezh.diary.core.web.defaultDeps
import com.ezh.diary.core.web.startEzhServer

/**
 * Сборка бэкенда на Android (этап 7 Kotlin-миграции).
 *
 * Заменяет android_server.py: те же пути в filesDir, тот же порт 5000,
 * тот же набор сервисов — только вместо Flask/Waitress теперь Ktor из :core.
 */
object EzhServer {
    private val lock = Any()
    private var started = false

    @JvmStatic
    fun start(context: Context) {
        val app = context.applicationContext
        synchronized(lock) {
            if (started) return
            started = true
        }

        val files = DataFiles(app.filesDir)
        files.ensure()
        copyBundledTeachers(app, files)

        val deps = defaultDeps(
            version = BuildConfig.VERSION_NAME,
            db = AndroidDb(EzhDbHelper(app)),
            files = files,
            assets = AndroidAssets(app.assets),
            bundles = AndroidBundles(app.assets),
        )

        // Как Flask-версия: прогрев расписаний преподавателей раз в 6 часов.
        deps.teacherService.startBackgroundRefresh()
        startEzhServer(deps)
    }

    /** teachers.json из APK → filesDir, только если в данных ещё нет кэша. */
    private fun copyBundledTeachers(context: Context, files: DataFiles) {
        if (files.teachersFile.exists()) return
        val bundled = AndroidBundles(context.assets).text("teachers.json") ?: return
        runCatching { files.teachersFile.writeText(bundled) }
    }
}
