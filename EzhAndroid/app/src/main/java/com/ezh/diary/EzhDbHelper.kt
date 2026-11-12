package com.ezh.diary

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * SQLite-файл приложения. Схему создаёт `initSchema()` из :core при старте
 * сервера, поэтому `onCreate` пустой: так схема живёт в одном месте.
 */
class EzhDbHelper(context: Context) : SQLiteOpenHelper(context, "planner.db", null, 1) {
    override fun onConfigure(db: SQLiteDatabase) {
        // Как в Flask-версии: внешние ключи включены, журнал WAL.
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        // Ничего: таблицы создаёт com.ezh.diary.core.db.initSchema().
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // База только у тестеров и пересоздаётся на чистой установке (решение
        // из плана миграции: старые данные не переносим).
    }
}
