package com.ezh.diary.core.db

/**
 * Схема БД — точная копия таблиц из app_data.py (Flask-версии).
 * Имена колонок и типы важно сохранить: паритет с golden-контрактом и
 * бэкапами, которые пользователи уже сохранили.
 */
private val TABLES = listOf(
    """CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        text TEXT,
        status TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS lab_progress (
        group_name TEXT,
        subject TEXT,
        completed INTEGER,
        total INTEGER,
        PRIMARY KEY (group_name, subject)
    )""",
    """CREATE TABLE IF NOT EXISTS lab_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name TEXT,
        subject TEXT,
        idx INTEGER,
        title TEXT,
        completed INTEGER,
        UNIQUE (group_name, subject, idx)
    )""",
    """CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        group_name TEXT,
        subgroup TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS subject_settings (
        subject TEXT PRIMARY KEY,
        custom_name TEXT,
        link TEXT,
        teacher TEXT,
        location TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS custom_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name TEXT,
        base_date TEXT,
        time_range TEXT,
        lesson TEXT,
        type_name TEXT,
        teacher TEXT,
        location TEXT,
        is_event INTEGER,
        recurrence TEXT,
        exceptions TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS tracked_teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        slug TEXT UNIQUE
    )""",
)

fun Db.initSchema() {
    transaction {
        TABLES.forEach { update(it) }
    }
}
