package com.ezh.diary.core.web

import com.ezh.diary.core.db.Db
import com.ezh.diary.core.moodle.MoodleService
import com.ezh.diary.core.moodle.OkHttpMoodleHttp
import com.ezh.diary.core.planner.Planner
import com.ezh.diary.core.planner.SevsuGroupsApi
import com.ezh.diary.core.planner.SevsuScheduleApi
import com.ezh.diary.core.storage.Bundles
import com.ezh.diary.core.storage.DataFiles
import com.ezh.diary.core.teacher.SevsuTeachersApi
import com.ezh.diary.core.teacher.TeacherService

/**
 * Готовые зависимости с боевыми HTTP-клиентами.
 *
 * Нужна, чтобы Android-модуль (:app) не собирал Moodle/планировщик руками и
 * не тащил в свой compile-classpath OkHttp и прочие внутренности :core.
 */
fun defaultDeps(
    version: String,
    db: Db,
    files: DataFiles,
    assets: StaticAssets? = null,
    bundles: Bundles = Bundles.Empty,
): ApiDeps {
    val teacherService = TeacherService(
        SevsuTeachersApi(),
        files.teachersFile,
        files.teacherSchedulesDir,
    )
    return ApiDeps(
        version = version,
        db = db,
        files = files,
        planner = Planner(SevsuScheduleApi()),
        teacherService = teacherService,
        moodleService = MoodleService(
            httpFactory = { cookies -> OkHttpMoodleHttp(cookies) },
            cookiesFile = files.moodleCookiesFile,
            cacheFile = files.moodleCacheFile,
            errorLogFile = files.moodleErrorLogFile,
        ),
        assets = assets,
        bundles = bundles,
        groupsApi = SevsuGroupsApi(),
    )
}
