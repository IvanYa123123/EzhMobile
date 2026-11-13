# Фикстуры сайта СевГУ

Снято 2026-11-12 с живого https://schedule.sevsu.ru при переносе бэкенда
с Python на Kotlin. Используются в тестах паритета, чтобы они не зависели
от сети и от изменений вёрстки на сайте.

| Файл | Что внутри |
| --- | --- |
| `groups.txt` | список групп из `Group.txt` приложения (616 строк) |
| `teachers_cache.json` | кэш `teachers.json` приложения (996 преподавателей) |
| `teachers.html.gz` | HTML страницы `/teachers` |
| `schedule_pin-b-24-2-o_wNN.json.gz` | сырой ответ `/api/schedule?v=6.2&section=0&group=ПИН/б-24-2-о&week=NN`, недели 1–20 (18–20 пустые) |
| `schedule_ivt-b-24-2-o_wNN.json.gz` | то же для `ИВТ/б-24-2-о`, недели 1–10 |
| `teacher_<slug>.ics.gz` | сырой ICS с `/calendar/teacher/<slug>` |

Все файлы, кроме `.txt`/`.json`, сжаты gzip: читать через `gzip`/`GZIPInputStream`.
Номер недели — параметр `week` API сайта (не ISO-неделя).
