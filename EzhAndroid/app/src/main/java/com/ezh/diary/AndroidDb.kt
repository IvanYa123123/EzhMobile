package com.ezh.diary

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteStatement
import com.ezh.diary.core.db.Db
import com.ezh.diary.core.db.DbSession
import com.ezh.diary.core.db.Row

/**
 * Android-реализация `Db` из :core поверх SQLiteOpenHelper.
 *
 * Репозитории в :core не знают про Android; здесь только привязка аргументов
 * и перевод курсора в `Row`.
 */
class AndroidDb(private val helper: EzhDbHelper) : Db {
    override fun <T> transaction(block: DbSession.() -> T): T {
        // writableDatabase кэшируется хелпером и потокобезопасен.
        val db = helper.writableDatabase
        db.beginTransaction()
        return try {
            val session = AndroidSession(db)
            val result = with(session) { block() }
            db.setTransactionSuccessful()
            result
        } finally {
            db.endTransaction()
        }
    }
}

private class AndroidSession(private val db: SQLiteDatabase) : DbSession {
    override fun update(sql: String, args: List<Any?>): Int {
        val statement = db.compileStatement(sql)
        return try {
            bind(statement, args)
            statement.executeUpdateDelete()
        } finally {
            statement.close()
        }
    }

    override fun insert(sql: String, args: List<Any?>): Int {
        val statement = db.compileStatement(sql)
        return try {
            bind(statement, args)
            statement.executeInsert().toInt()
        } finally {
            statement.close()
        }
    }

    override fun query(sql: String, args: List<Any?>): List<Row> {
        // rawQuery принимает только строки; числовые аргументы SQLite сравнивает
        // с учётом типа колонки, поэтому это безопасно.
        val cursor = db.rawQuery(sql, args.map { it?.toString() }.toTypedArray())
        return try {
            readRows(cursor)
        } finally {
            cursor.close()
        }
    }

    private fun bind(statement: SQLiteStatement, args: List<Any?>) {
        args.forEachIndexed { index, value ->
            val position = index + 1
            when (value) {
                null -> statement.bindNull(position)
                is String -> statement.bindString(position, value)
                is Int -> statement.bindLong(position, value.toLong())
                is Long -> statement.bindLong(position, value)
                is Boolean -> statement.bindLong(position, if (value) 1L else 0L)
                is Double -> statement.bindDouble(position, value)
                is Float -> statement.bindDouble(position, value.toDouble())
                else -> statement.bindString(position, value.toString())
            }
        }
    }

    private fun readRows(cursor: Cursor): List<Row> {
        val columns = cursor.columnNames
        val rows = ArrayList<Row>(cursor.count)
        while (cursor.moveToNext()) {
            val values = HashMap<String, Any?>(columns.size)
            for (i in columns.indices) {
                values[columns[i]] = when (cursor.getType(i)) {
                    Cursor.FIELD_TYPE_NULL -> null
                    Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(i)
                    Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(i)
                    Cursor.FIELD_TYPE_BLOB -> cursor.getBlob(i)
                    else -> cursor.getString(i)
                }
            }
            rows.add(Row(values))
        }
        return rows
    }
}
