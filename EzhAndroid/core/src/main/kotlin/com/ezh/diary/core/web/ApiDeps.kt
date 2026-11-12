package com.ezh.diary.core.web

import com.ezh.diary.core.db.CustomScheduleRepo
import com.ezh.diary.core.db.Db
import com.ezh.diary.core.db.FriendsRepo
import com.ezh.diary.core.db.LabsRepo
import com.ezh.diary.core.db.SubjectsRepo
import com.ezh.diary.core.db.TasksRepo
import com.ezh.diary.core.db.TrackedTeachersRepo
import com.ezh.diary.core.moodle.MoodleService
import com.ezh.diary.core.planner.GroupsApi
import com.ezh.diary.core.planner.SemesterPlanner
import com.ezh.diary.core.storage.Bundles
import com.ezh.diary.core.storage.CustomGroups
import com.ezh.diary.core.storage.DataFiles
import com.ezh.diary.core.storage.ScheduleCache
import com.ezh.diary.core.storage.SyncTimes
import com.ezh.diary.core.teacher.TeacherService

/**
 * Всё, что нужно маршрутам, в одном месте: база, файлы, планировщик.
 * Собирается в :app (этап 7) и в тестах; маршруты ничего не создают сами.
 */
class ApiDeps(
    val version: String,
    val db: Db,
    val files: DataFiles,
    val planner: SemesterPlanner,
    val teacherService: TeacherService,
    val moodleService: MoodleService,
    val limiter: RateLimiter = RateLimiter(),
    val clock: () -> Long = { System.currentTimeMillis() },
    val log: (String) -> Unit = {},
    /** Статика для `/` и `/static/...`; в тестах и на JVM может отсутствовать. */
    val assets: StaticAssets? = null,
    /** Group.txt/VERSION/teachers.json из бандла (Android — AssetManager). */
    val bundles: Bundles = Bundles.Empty,
    /** Резервный источник списка групп, если Group.txt пуст. */
    val groupsApi: GroupsApi? = null,
) {
    val tasks = TasksRepo(db)
    val friends = FriendsRepo(db)
    val subjects = SubjectsRepo(db)
    val customSchedule = CustomScheduleRepo(db)
    val labs = LabsRepo(db)
    val trackedTeachers = TrackedTeachersRepo(db)
    val customGroups = CustomGroups(files.customGroupsFile)
    val syncTimes = SyncTimes(files.syncTimesFile, clock)
    val scheduleCache = ScheduleCache(log)
}
