package com.ezh.diary.core.db

data class Task(val id: Int, val date: String, val text: String, val status: String)

data class Friend(val id: Int, val name: String, val groupName: String, val subgroup: String)

data class SubjectSettings(
    val subject: String,
    val customName: String,
    val link: String,
    val teacher: String,
    val location: String,
)

data class CustomLesson(
    val id: Int,
    val groupName: String,
    val baseDate: String,
    val timeRange: String,
    val lesson: String,
    val typeName: String,
    val teacher: String,
    val location: String,
    val isEvent: Boolean,
    val recurrence: String,
    val exceptions: String,
)

data class TrackedTeacher(val id: Int, val name: String, val slug: String)

data class LabProgress(val completed: Int, val total: Int)

data class LabItem(
    val id: Int,
    val groupName: String,
    val subject: String,
    val idx: Int,
    val title: String,
    val completed: Boolean,
)

class TasksRepo(private val db: Db) {
    fun list(date: String? = null): List<Task> = db.transaction {
        val sql = """SELECT id, date, text, status FROM tasks""" +
            (if (date == null) "" else " WHERE date = ?") + " ORDER BY id"
        val args = if (date == null) emptyList() else listOf(date)
        query(sql, args).map {
            Task(it.int("id"), it.str("date"), it.str("text"), it.str("status"))
        }
    }

    fun insert(date: String, text: String, status: String): Int = db.transaction {
        insert("INSERT INTO tasks (date, text, status) VALUES (?, ?, ?)", listOf(date, text, status))
    }

    fun update(id: Int, date: String, text: String, status: String): Boolean = db.transaction {
        update(
            "UPDATE tasks SET date = ?, text = ?, status = ? WHERE id = ?",
            listOf(date, text, status, id),
        ) > 0
    }

    fun delete(id: Int): Boolean = db.transaction {
        update("DELETE FROM tasks WHERE id = ?", listOf(id)) > 0
    }

    fun distinctDates(): List<String> = db.transaction {
        query("SELECT DISTINCT date FROM tasks ORDER BY date").map { it.str("date") }
    }

    fun listBetween(start: String, end: String): List<Task> = db.transaction {
        query(
            "SELECT id, date, text, status FROM tasks WHERE date BETWEEN ? AND ? ORDER BY id",
            listOf(start, end),
        ).map {
            Task(it.int("id"), it.str("date"), it.str("text"), it.str("status"))
        }
    }

    fun search(like: String, limit: Int = 50): List<Task> = db.transaction {
        query(
            "SELECT id, date, text, status FROM tasks WHERE text LIKE ? " +
                "ORDER BY date DESC LIMIT ?",
            listOf(like, limit),
        ).map { Task(it.int("id"), it.str("date"), it.str("text"), it.str("status")) }
    }
}

class FriendsRepo(private val db: Db) {
    fun list(): List<Friend> = db.transaction {
        query("SELECT id, name, group_name, subgroup FROM friends ORDER BY id").map {
            Friend(it.int("id"), it.str("name"), it.str("group_name"), it.str("subgroup"))
        }
    }

    fun insert(name: String, groupName: String, subgroup: String): Int = db.transaction {
        insert(
            "INSERT INTO friends (name, group_name, subgroup) VALUES (?, ?, ?)",
            listOf(name, groupName, subgroup),
        )
    }

    fun update(id: Int, name: String, groupName: String, subgroup: String): Boolean = db.transaction {
        update(
            "UPDATE friends SET name = ?, group_name = ?, subgroup = ? WHERE id = ?",
            listOf(name, groupName, subgroup, id),
        ) > 0
    }

    fun delete(id: Int): Boolean = db.transaction {
        update("DELETE FROM friends WHERE id = ?", listOf(id)) > 0
    }
}

class SubjectsRepo(private val db: Db) {
    fun list(): List<SubjectSettings> = db.transaction {
        query(
            """SELECT subject, custom_name, link, teacher, location
               FROM subject_settings ORDER BY subject""",
        ).map {
            SubjectSettings(
                it.str("subject"),
                it.str("custom_name"),
                it.str("link"),
                it.str("teacher"),
                it.str("location"),
            )
        }
    }

    fun upsert(
        subject: String,
        customName: String,
        link: String,
        teacher: String,
        location: String,
    ) = db.transaction {
        update(
            """INSERT INTO subject_settings (subject, custom_name, link, teacher, location)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(subject) DO UPDATE SET
                 custom_name = excluded.custom_name,
                 link = excluded.link,
                 teacher = excluded.teacher,
                 location = excluded.location""",
            listOf(subject, customName, link, teacher, location),
        )
    }
}

class CustomScheduleRepo(private val db: Db) {
    fun list(): List<CustomLesson> = db.transaction {
        query(
            """SELECT id, group_name, base_date, time_range, lesson, type_name,
                      teacher, location, is_event, recurrence, exceptions
               FROM custom_schedule ORDER BY id""",
        ).map {
            CustomLesson(
                it.int("id"),
                it.str("group_name"),
                it.str("base_date"),
                it.str("time_range"),
                it.str("lesson"),
                it.str("type_name"),
                it.str("teacher"),
                it.str("location"),
                it.int("is_event") != 0,
                it.str("recurrence"),
                it.str("exceptions"),
            )
        }
    }

    fun insert(
        groupName: String,
        baseDate: String,
        timeRange: String,
        lesson: String,
        typeName: String,
        teacher: String,
        location: String,
        isEvent: Boolean,
        recurrence: String,
        exceptions: String,
    ): Int = db.transaction {
        insert(
            """INSERT INTO custom_schedule
               (group_name, base_date, time_range, lesson, type_name, teacher,
                location, is_event, recurrence, exceptions)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            listOf(
                groupName, baseDate, timeRange, lesson, typeName, teacher,
                location, if (isEvent) 1 else 0, recurrence, exceptions,
            ),
        )
    }

    fun update(
        id: Int,
        groupName: String,
        baseDate: String,
        timeRange: String,
        lesson: String,
        typeName: String,
        teacher: String,
        location: String,
        isEvent: Boolean,
        recurrence: String,
        exceptions: String,
    ): Boolean = db.transaction {
        update(
            """UPDATE custom_schedule SET
                 group_name = ?, base_date = ?, time_range = ?, lesson = ?,
                 type_name = ?, teacher = ?, location = ?, is_event = ?,
                 recurrence = ?, exceptions = ?
               WHERE id = ?""",
            listOf(
                groupName, baseDate, timeRange, lesson, typeName, teacher,
                location, if (isEvent) 1 else 0, recurrence, exceptions, id,
            ),
        ) > 0
    }

    fun delete(id: Int): Boolean = db.transaction {
        update("DELETE FROM custom_schedule WHERE id = ?", listOf(id)) > 0
    }

    /** PUT не меняет group_name — как в Flask-версии. */
    fun updateContent(
        id: Int,
        baseDate: String,
        timeRange: String,
        lesson: String,
        typeName: String,
        teacher: String,
        location: String,
        isEvent: Boolean,
        recurrence: String,
        exceptions: String,
    ): Boolean = db.transaction {
        update(
            """UPDATE custom_schedule SET
                 base_date = ?, time_range = ?, lesson = ?, type_name = ?,
                 teacher = ?, location = ?, is_event = ?, recurrence = ?, exceptions = ?
               WHERE id = ?""",
            listOf(
                baseDate, timeRange, lesson, typeName, teacher, location,
                if (isEvent) 1 else 0, recurrence, exceptions, id,
            ),
        ) > 0
    }

    fun byGroup(groupName: String): List<CustomLesson> = db.transaction {
        query(
            """SELECT id, group_name, base_date, time_range, lesson, type_name,
                      teacher, location, is_event, recurrence, exceptions
               FROM custom_schedule WHERE group_name = ? ORDER BY id""",
            listOf(groupName),
        ).map { it.toLesson() }
    }

    fun search(like: String, limit: Int = 50): List<CustomLesson> = db.transaction {
        query(
            """SELECT id, group_name, base_date, time_range, lesson, type_name,
                      teacher, location, is_event, recurrence, exceptions
               FROM custom_schedule WHERE lesson LIKE ? ORDER BY base_date DESC LIMIT ?""",
            listOf(like, limit),
        ).map { it.toLesson() }
    }

    private fun Row.toLesson() = CustomLesson(
        int("id"),
        str("group_name"),
        str("base_date"),
        str("time_range"),
        str("lesson"),
        str("type_name"),
        str("teacher"),
        str("location"),
        int("is_event") != 0,
        str("recurrence"),
        str("exceptions"),
    )
}

class TrackedTeachersRepo(private val db: Db) {
    fun list(): List<TrackedTeacher> = db.transaction {
        query("SELECT id, name, slug FROM tracked_teachers ORDER BY id").map {
            TrackedTeacher(it.int("id"), it.str("name"), it.str("slug"))
        }
    }

    /** null — такой slug уже есть (уникальный индекс). */
    fun insert(name: String, slug: String): Int? = db.transaction {
        val existing = query("SELECT id FROM tracked_teachers WHERE slug = ?", listOf(slug))
        if (existing.isNotEmpty()) null
        else insert(
            "INSERT INTO tracked_teachers (name, slug) VALUES (?, ?)",
            listOf(name, slug),
        )
    }

    fun delete(id: Int): Boolean = db.transaction {
        update("DELETE FROM tracked_teachers WHERE id = ?", listOf(id)) > 0
    }
}

class LabsRepo(private val db: Db) {
    fun progress(groupName: String? = null): Map<String, LabProgress> = db.transaction {
        val sql = """SELECT group_name, subject, completed, total FROM lab_progress""" +
            (if (groupName == null) "" else " WHERE group_name = ?")
        val args = if (groupName == null) emptyList() else listOf(groupName)
        query(sql, args).associate {
            it.str("subject") to LabProgress(it.int("completed"), it.int("total"))
        }
    }

    fun saveProgress(groupName: String, subject: String, completed: Int, total: Int) = db.transaction {
        update(
            """INSERT INTO lab_progress (group_name, subject, completed, total)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(group_name, subject) DO UPDATE SET
                 completed = excluded.completed,
                 total = excluded.total""",
            listOf(groupName, subject, completed, total),
        )
    }

    fun items(groupName: String, subject: String? = null): List<LabItem> = db.transaction {
        val sql = """SELECT id, group_name, subject, idx, title, completed
                     FROM lab_items WHERE group_name = ?""" +
            (if (subject == null) "" else " AND subject = ?") + " ORDER BY subject, idx"
        val args = if (subject == null) listOf(groupName) else listOf(groupName, subject)
        query(sql, args).map {
            LabItem(
                it.int("id"),
                it.str("group_name"),
                it.str("subject"),
                it.int("idx"),
                it.str("title"),
                it.int("completed") != 0,
            )
        }
    }

    fun count(groupName: String, subject: String): Int = db.transaction {
        query(
            "SELECT COUNT(*) AS n FROM lab_items WHERE group_name = ? AND subject = ?",
            listOf(groupName, subject),
        ).firstOrNull()?.int("n") ?: 0
    }

    /** INSERT OR IGNORE по UNIQUE(group_name, subject, idx). true — строка добавлена. */
    fun insertIgnore(groupName: String, subject: String, idx: Int, title: String): Boolean =
        db.transaction {
            update(
                "INSERT OR IGNORE INTO lab_items (group_name, subject, idx, title, completed) " +
                    "VALUES (?, ?, ?, ?, 0)",
                listOf(groupName, subject, idx, title),
            ) > 0
        }

    fun removeLast(groupName: String, subject: String): Int? = db.transaction {
        val last = query(
            "SELECT MAX(idx) AS idx FROM lab_items WHERE group_name = ? AND subject = ?",
            listOf(groupName, subject),
        ).firstOrNull()?.intOrNull("idx") ?: return@transaction null
        update(
            "DELETE FROM lab_items WHERE group_name = ? AND subject = ? AND idx = ?",
            listOf(groupName, subject, last),
        )
        last
    }

    fun setCompleted(id: Int, completed: Boolean): Boolean = db.transaction {
        update(
            "UPDATE lab_items SET completed = ? WHERE id = ?",
            listOf(if (completed) 1 else 0, id),
        ) > 0
    }

    fun delete(id: Int): Boolean = db.transaction {
        update("DELETE FROM lab_items WHERE id = ?", listOf(id)) > 0
    }

    fun get(id: Int): LabItem? = db.transaction {
        query(
            """SELECT id, group_name, subject, idx, title, completed
               FROM lab_items WHERE id = ?""",
            listOf(id),
        ).firstOrNull()?.let {
            LabItem(
                it.int("id"),
                it.str("group_name"),
                it.str("subject"),
                it.int("idx"),
                it.str("title"),
                it.int("completed") != 0,
            )
        }
    }

    fun setTitle(id: Int, title: String): Boolean = db.transaction {
        update("UPDATE lab_items SET title = ? WHERE id = ?", listOf(title, id)) > 0
    }

    /** Пересчёт lab_progress по lab_items — порт _recalc_lab_progress. */
    fun recalc(groupName: String, subject: String) = db.transaction {
        val row = query(
            """SELECT COUNT(*) AS total, COALESCE(SUM(completed), 0) AS done
               FROM lab_items WHERE group_name = ? AND subject = ?""",
            listOf(groupName, subject),
        ).first()
        val total = row.int("total")
        val done = row.int("done")
        if (total == 0) {
            update(
                "DELETE FROM lab_progress WHERE group_name = ? AND subject = ?",
                listOf(groupName, subject),
            )
        } else {
            update(
                """INSERT INTO lab_progress (group_name, subject, completed, total)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(group_name, subject) DO UPDATE SET
                     completed = excluded.completed,
                     total = excluded.total""",
                listOf(groupName, subject, done, total),
            )
        }
    }
}
