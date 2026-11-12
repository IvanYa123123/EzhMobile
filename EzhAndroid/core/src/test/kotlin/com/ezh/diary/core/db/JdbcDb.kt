package com.ezh.diary.core.db

import java.sql.Connection
import java.sql.DriverManager
import java.sql.Statement

/**
 * JDBC-реализация Db для тестов на JVM. В Android-сборку не попадает:
 * там будет обёртка над SQLiteOpenHelper.
 */
class JdbcDb(private val url: String) : Db {
    private val lock = Any()

    override fun <T> transaction(block: DbSession.() -> T): T = synchronized(lock) {
        DriverManager.getConnection(url).use { conn ->
            conn.autoCommit = false
            try {
                val result = JdbcSession(conn).block()
                conn.commit()
                result
            } catch (e: Throwable) {
                conn.rollback()
                throw e
            }
        }
    }
}

private class JdbcSession(private val conn: Connection) : DbSession {
    override fun update(sql: String, args: List<Any?>): Int =
        conn.prepareStatement(sql).use { ps ->
            bind(ps, args)
            ps.executeUpdate()
        }

    override fun insert(sql: String, args: List<Any?>): Int =
        conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS).use { ps ->
            bind(ps, args)
            ps.executeUpdate()
            ps.generatedKeys.use { rs -> if (rs.next()) rs.getInt(1) else 0 }
        }

    override fun query(sql: String, args: List<Any?>): List<Row> =
        conn.prepareStatement(sql).use { ps ->
            bind(ps, args)
            ps.executeQuery().use { rs ->
                val columns = (1..rs.metaData.columnCount).map { rs.metaData.getColumnLabel(it) }
                buildList {
                    while (rs.next()) {
                        add(Row(columns.associateWith { rs.getObject(it) }))
                    }
                }
            }
        }

    private fun bind(ps: java.sql.PreparedStatement, args: List<Any?>) {
        args.forEachIndexed { i, value -> ps.setObject(i + 1, value) }
    }
}
