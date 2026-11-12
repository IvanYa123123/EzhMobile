"""Поднимает приложение с заглушками вместо сети СевГУ (для ui.test.mjs)."""
import datetime
import os
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "EzhAndroid" / "app" / "src" / "main" / "python"
sys.path.insert(0, str(APP_DIR))

GROUP = "ПИН/б-24-2-о"


def _monday(weeks=0):
    today = datetime.date.today()
    return today - datetime.timedelta(days=today.weekday()) + datetime.timedelta(weeks=weeks)


def _schedule():
    items = []
    for week in (0, 1, 2):
        for day in range(7):
            items.append({
                "date": (_monday(week) + datetime.timedelta(days=day)).isoformat(),
                "n": 1,
                "time_range": "08:30 - 10:00",
                "lesson": "Математический анализ",
                "type_name": "Лекция",
                "teacher": "Иванов Иван Иванович",
                "location": "А-101",
                "subgroup": "0",
            })
    return items


def _teacher_pairs():
    return [{
        "date": (_monday(0) + datetime.timedelta(days=day)).isoformat(),
        "n": 2,
        "time_range": "10:10 - 11:40",
        "lesson": "Практикум по математике",
        "type_name": "ПЗ",
        "location": "Б-202",
        "groups": [GROUP],
    } for day in range(7)]


import planner  # noqa: E402
import teacher_planner  # noqa: E402

# Методы подменяем через setattr: так Pyright/Pylance не ругается на присваивание
# атрибуту класса (в рантайме это обычные monkey-patch заглушки).
setattr(planner.SevSUPlanner, "get_semester_schedule",
        lambda self, group, subgroup="0", max_weeks=25: (_schedule(), False))
setattr(teacher_planner.SevSUTeacherPlanner, "get_teachers",
        lambda self, force=False: [{"name": "Абаев Евгений Александрович",
                                    "slug": "abaev-evgenij-aleksandrovich"}])
setattr(teacher_planner.SevSUTeacherPlanner, "get_teacher_schedule",
        lambda self, slug, force=False: _teacher_pairs())
setattr(teacher_planner.SevSUTeacherPlanner, "start_background_refresh",
        lambda self, interval_hours=6: None)

from app import app  # noqa: E402

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("EZH_TEST_PORT", "5099")), threaded=True)
