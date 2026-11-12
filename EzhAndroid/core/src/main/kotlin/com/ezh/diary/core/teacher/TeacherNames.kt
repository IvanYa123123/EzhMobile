package com.ezh.diary.core.teacher

/** Преподаватель из списка /teachers: имя для показа и slug для расписания. */
data class Teacher(val name: String, val slug: String)

// Фамилия/имя/отчество: слово с заглавной и хотя бы двумя строчными после неё.
// Строки вида «0 - ОМР», «Вакансия УПП» под шаблон не подходят,
// а «2 - доц - внеш - Исаев» подходит — настоящих преподавателей не теряем.
private val TITLE_RE = Regex("^[А-ЯЁ][а-яё]{2,}(?:-[А-ЯЁ][а-яё]{2,})?$")

private val NON_NAME_WORDS = setOf(
    "вакансия", "доц", "внеш", "внутр", "внут", "омр", "итс", "сиз", "асс",
    "преп", "ставка", "кафедра", "ппс", "ууп", "снк",
)

private val NAME_WORD_RE = Regex("[А-ЯЁа-яё\\-]+")
private val WS_RE = Regex("\\s+")

/** Есть ли в строке хотя бы одно слово, похожее на ФИО. */
fun isPersonName(name: String?): Boolean {
    if (name.isNullOrBlank()) return false
    return NAME_WORD_RE.findAll(name).any { match ->
        val word = match.value
        word.lowercase() !in NON_NAME_WORDS && TITLE_RE.matches(word)
    }
}

/** Текст кнопки под ссылкой «Открыть расписание» — это не имя. */
fun looksLikeButtonText(text: String): Boolean {
    val low = text.lowercase().trim(' ', ':', '.', '-', '—')
    return low in setOf("открыть расписание", "открыть", "расписание", "показать")
}

internal fun normalizeSpaces(text: String): String = WS_RE.replace(text, " ").trim()

internal val TEACHER_HREF_RE = Regex("^/teachers/([a-z0-9][a-z0-9\\-]*[a-z0-9])/?$")

internal val SLUG_RE = Regex("^[a-z0-9][a-z0-9\\-]{0,80}[a-z0-9]$")

/** Проверка slug из запроса: пусто/мусор → null (как _validate_slug в Python). */
fun validateSlug(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    val slug = raw.trim().lowercase()
    return if (SLUG_RE.matches(slug)) slug else null
}
