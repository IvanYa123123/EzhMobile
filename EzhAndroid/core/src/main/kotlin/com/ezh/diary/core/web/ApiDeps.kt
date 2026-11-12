package com.ezh.diary.core.web

import com.ezh.diary.core.db.CustomScheduleRepo
import com.ezh.diary.core.db.Db
import com.ezh.diary.core.db.FriendsRepo
import com.ezh.diary.core.db.LabsRepo
import com.ezh.diary.core.db.SubjectsRepo
import com.ezh.diary.core.db.TasksRepo
import com.ezh.diary.core.planner.SemesterPlanner
import com.ezh.diary.core.storage.CustomGroups
import com.ezh.diary.core.storage.DataFiles
import com.ezh.diary.core.storage.ScheduleCache
import com.ezh.diary.core.storage.SyncTimes

/**
 * Всё, что нужно маршрутам, в одном месте: база, файлы, планировщик.
 * Собирается в :app (этап 7) и в тестах; маршруты ничего не создают сами.
 */
class ApiDeps(
    val version: String,
    val db: Db,
    val files: DataFiles,
    val planner: SemesterPlanner,
    val limiter: RateLimiter = RateLimiter(),
    val clock: () -> Long = { System.currentTimeMillis() },
    val log: (String) -> Unit = {},
) {
    val tasks = TasksRepo(db)
    val friends = FriendsRepo(db)
    val subjects = SubjectsRepo(db)
    val customSchedule = CustomScheduleRepo(db)
    val labs = LabsRepo(db)
    val customGroups = CustomGroups(files.customGroupsFile)
    val syncTimes = SyncTimes(files.syncTimesFile, clock)
    val scheduleCache = ScheduleCache(log)
}
