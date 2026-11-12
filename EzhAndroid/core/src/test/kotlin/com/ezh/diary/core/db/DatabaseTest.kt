package com.ezh.diary.core.db

import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DatabaseTest {
    private lateinit var db: JdbcDb

    @Before
    fun setUp() {
        val file = Files.createTempFile("ezh-test", ".db").toFile()
        file.deleteOnExit()
        db = JdbcDb("jdbc:sqlite:" + file.absolutePath)
        db.initSchema()
    }

    @After
    fun tearDown() = Unit

    @Test
    fun tasksCrud() {
        val repo = TasksRepo(db)

        val id = repo.insert("2026-11-12", "Лаба", "pending")
        val task = repo.list().single()
        assertEquals(id, task.id)
        assertEquals("2026-11-12", task.date)

        assertTrue(repo.update(id, "2026-11-13", "Лаба 2", "completed"))
        assertEquals("completed", repo.list().single().status)
        assertEquals(listOf("2026-11-13"), repo.distinctDates())

        assertTrue(repo.delete(id))
        assertTrue(repo.list().isEmpty())
    }

    @Test
    fun friendsCrud() {
        val repo = FriendsRepo(db)
        val id = repo.insert("Ваня", "ПИН/б-24-1-о", "2")

        assertEquals(listOf(Friend(id, "Ваня", "ПИН/б-24-1-о", "2")), repo.list())

        assertTrue(repo.update(id, "Ваня", "ПИН/б-24-2-о", "0"))
        assertEquals("ПИН/б-24-2-о", repo.list().single().groupName)
        assertTrue(repo.delete(id))
    }

    @Test
    fun labsProgressAndItems() {
        val repo = LabsRepo(db)
        repo.saveProgress("ПИН/б-24-2-о", "Физика (ЛЗ)", completed = 1, total = 3)
        repo.saveProgress("ПИН/б-24-2-о", "Физика (ЛЗ)", completed = 2, total = 3)

        assertEquals(2, repo.progress("ПИН/б-24-2-о")["Физика (ЛЗ)"]?.completed)

        assertTrue(repo.insertIgnore("ПИН/б-24-2-о", "Физика (ЛЗ)", 1, "ЛЗ1"))
        assertFalse("повторный idx не вставляется", repo.insertIgnore("ПИН/б-24-2-о", "Физика (ЛЗ)", 1, "ЛЗ1"))
        assertTrue(repo.insertIgnore("ПИН/б-24-2-о", "Физика (ЛЗ)", 2, "ЛЗ2"))
        assertEquals(2, repo.count("ПИН/б-24-2-о", "Физика (ЛЗ)"))

        assertEquals(2, repo.removeLast("ПИН/б-24-2-о", "Физика (ЛЗ)"))
        assertEquals(1, repo.count("ПИН/б-24-2-о", "Физика (ЛЗ)"))
    }

    @Test
    fun trackedTeacherSlugIsUnique() {
        val repo = TrackedTeachersRepo(db)

        val id = repo.insert("Абаев Евгений Александрович", "abaev-evgenij-aleksandrovich")
        assertNull(repo.insert("Абаев Евгений Александрович", "abaev-evgenij-aleksandrovich"))
        assertEquals(id, repo.list().single().id)
        assertTrue(repo.delete(id!!))
    }

    @Test
    fun subjectsAndCustomSchedule() {
        val subjects = SubjectsRepo(db)
        subjects.upsert("Физика (ЛЗ)", "Физ.", "https://example.org", "Иванов", "I-101")
        assertEquals("Физ.", subjects.list().single().customName)

        val lessons = CustomScheduleRepo(db)
        val id = lessons.insert(
            "ПИН/б-24-2-о", "2026-11-12", "14:00 - 15:30", "Консультация", "ПЗ",
            "Петров", "I-202", isEvent = true, recurrence = "", exceptions = "[]",
        )
        assertEquals(1, lessons.list().size)
        assertTrue(lessons.delete(id))
    }
}
