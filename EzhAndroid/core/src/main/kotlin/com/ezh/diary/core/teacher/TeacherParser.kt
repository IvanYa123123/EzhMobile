package com.ezh.diary.core.teacher

import org.jsoup.Jsoup
import org.jsoup.nodes.Element

/**
 * Парсер страницы /teachers (список преподавателей).
 *
 * Разметка сайта: `<li> <div class="teacher-name">ФИО</div>
 * <a href="/teachers/<slug>">Открыть расписание</a> </li>`.
 * Имя ищем вверх до ближайшего li/div/tr/article (не глубже 5 уровней),
 * затем первый достаточно длинный текстовый тег без вложенных ссылок.
 */
object TeacherParser {
    private val PARENT_TAGS = setOf("li", "div", "tr", "article")
    private val NAME_TAGS = "span, div, td, h3, h4, p"

    fun parse(html: String?): List<Teacher> {
        if (html.isNullOrEmpty()) return emptyList()
        val doc = Jsoup.parse(html)
        val result = mutableListOf<Teacher>()
        val seen = mutableSetOf<String>()

        for (a in doc.select("a[href]")) {
            val match = TEACHER_HREF_RE.matchEntire(a.attr("href")) ?: continue
            val slug = match.groupValues[1]
            if (slug in seen) continue

            var name = ""
            val parent = findNameContainer(a)
            if (parent != null) {
                for (tag in parent.select(NAME_TAGS).take(8)) {
                    if (tag.selectFirst("a[href]") != null) continue
                    val text = tag.text()
                    if (text.isNotEmpty() && text.length > 4 && !looksLikeButtonText(text)) {
                        name = text
                        break
                    }
                }
                if (name.isEmpty()) name = parent.text()
            }

            name = normalizeSpaces(name)
            if (name.length < 3) continue
            if (looksLikeButtonText(name)) continue
            if (!isPersonName(name)) continue

            seen.add(slug)
            result.add(Teacher(name, slug))
        }
        return result
    }

    /** Ближайший предок из li/div/tr/article, не выше 5 уровней от ссылки. */
    private fun findNameContainer(link: Element): Element? {
        var current: Element? = link.parent()
        var depth = 0
        while (current != null && depth < 5) {
            if (current.tagName() in PARENT_TAGS) return current
            current = current.parent()
            depth++
        }
        return null
    }
}
