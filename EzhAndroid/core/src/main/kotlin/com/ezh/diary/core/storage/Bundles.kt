package com.ezh.diary.core.storage

/**
 * Файлы, которые лежат рядом с приложением, а не в каталоге данных.
 *
 * В Flask-версии это BUNDLE_DIR (Group.txt, VERSION, teachers.json).
 * На Android их отдаёт AssetManager, в JVM-тестах — обычная карта.
 */
fun interface Bundles {
    /** Содержимое файла по имени (`Group.txt`) или null, если файла нет. */
    fun text(name: String): String?

    companion object {
        val Empty: Bundles = Bundles { null }
    }
}
