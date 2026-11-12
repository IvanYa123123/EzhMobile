package com.ezh.diary.core.db

/**
 * Минимальная абстракция над SQLite.
 *
 * В :core нет Android API, поэтому конкретные реализации живут снаружи:
 * на JVM — JdbcDb (тесты), в Android-модуле — обёртка над SQLiteOpenHelper.
 * Репозитории работают только через DbSession и не знают, кто под капотом.
 */
interface Db {
    fun <T> transaction(block: DbSession.() -> T): T
}

interface DbSession {
    /** INSERT/UPDATE/DELETE; возвращает число изменённых строк. */
    fun update(sql: String, args: List<Any?> = emptyList()): Int

    /** INSERT с возвратом сгенерированного id (0, если id не выдавался). */
    fun insert(sql: String, args: List<Any?> = emptyList()): Int

    fun query(sql: String, args: List<Any?> = emptyList()): List<Row>
}

class Row(private val values: Map<String, Any?>) {
    operator fun get(column: String): Any? = values[column]

    fun str(column: String): String = (values[column] as? String) ?: ""

    fun int(column: String): Int = (values[column] as? Number)?.toInt() ?: 0

    fun intOrNull(column: String): Int? = (values[column] as? Number)?.toInt()

    fun stringOrNull(column: String): String? = values[column] as? String
}
