# -*- coding: utf-8 -*-
"""Снимает golden-контракт HTTP API (что сейчас отдаёт Flask).

Результат — tests/fixtures/golden/api_contract.json. Используется как эталон
при переносе бэкенда на Kotlin: те же пути, коды, заголовки и JSON.

Запуск (из корня репозитория):
    python tests/capture_golden.py
"""
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_DIR = ROOT / "EzhAndroid" / "app" / "src" / "main" / "python"
OUT = ROOT / "tests" / "fixtures" / "golden" / "api_contract.json"

DATA = Path(tempfile.mkdtemp(prefix="ezh-golden-"))
os.environ["EZH_DATA_DIR"] = str(DATA)
shutil.copy(APP_DIR / "teachers.json", DATA / "teachers.json")
sys.path.insert(0, str(APP_DIR))

import planner  # noqa: E402
import teacher_planner  # noqa: E402

GROUP = "ПИН/б-24-2-о"
SLUG = "abaev-evgenij-aleksandrovich"

_SCHEDULE = [
    {
        "date": "2026-09-07", "n": 1, "time_range": "08:30 - 10:00",
        "lesson": "Математический анализ", "type_name": "Лекция",
        "teacher": "Иванов Иван Иванович", "location": "А-101", "subgroup": "0",
    },
    {
        "date": "2026-09-08", "n": 2, "time_range": "10:10 - 11:40",
        "lesson": "Программирование", "type_name": "ЛЗ",
        "teacher": "Петров Пётр Петрович", "location": "Б-202", "subgroup": "1",
    },
]

_TEACHER_PAIRS = [
    {
        "date": "2026-09-07", "n": 2, "time_range": "10:10 - 11:40",
        "lesson": "Практикум", "type_name": "ПЗ", "location": "Б-202",
        "groups": [GROUP],
    },
]

setattr(planner.SevSUPlanner, "get_semester_schedule",
        lambda self, group, subgroup="0", max_weeks=25: (list(_SCHEDULE), False))
setattr(teacher_planner.SevSUTeacherPlanner, "get_teachers",
        lambda self, force=False: [{"name": "Абаев Евгений Александрович", "slug": SLUG}])
setattr(teacher_planner.SevSUTeacherPlanner, "get_teacher_schedule",
        lambda self, slug, force=False: list(_TEACHER_PAIRS))
setattr(teacher_planner.SevSUTeacherPlanner, "start_background_refresh",
        lambda self, interval_hours=6: None)

import app as app_module  # noqa: E402,F401  — регистрирует blueprint'ы
from app_data import app  # noqa: E402

app.config.update(TESTING=True)
client = app.test_client()

CASES = []

# (method, path, json_body) — порядок важен: POST создаёт данные, GET их читает.
REQUESTS = [
    ("GET", "/api/health", None),
    ("GET", "/api/groups", None),
    ("GET", "/api/tasks", None),
    ("POST", "/api/tasks", {"date": "2026-09-07", "text": "Сдать лабораторную", "status": "pending"}),
    ("GET", "/api/tasks", None),
    ("GET", "/api/task_dates?start=2026-09-01&end=2026-09-30", None),
    ("GET", "/api/tasks.ics", None),
    ("GET", "/api/labs", None),
    ("POST", "/api/labs", {"group": GROUP, "subject": "Физика (Лаб)", "completed": 1, "total": 4}),
    ("GET", "/api/labs", None),
    ("GET", "/api/lab_items?group=" + GROUP + "&subject=" + "Физика (Лаб)", None),
    ("GET", "/api/friends", None),
    ("POST", "/api/friends", {"name": "Друг Тестовый", "group": GROUP, "subgroup": "1"}),
    ("GET", "/api/friends", None),
    ("GET", "/api/subjects", None),
    ("POST", "/api/subjects", {"subject": "Физика (Лаб)", "custom_name": "Физика — лабы",
                               "teacher": "Сидоров С.С.", "location": "В-303"}),
    ("GET", "/api/subjects", None),
    ("GET", "/api/custom_schedule", None),
    ("POST", "/api/custom_schedule", {"group": GROUP, "base_date": "2026-09-07",
                                      "time_range": "08:30 - 10:00", "lesson": "Консультация",
                                      "type_name": "Консультация", "teacher": "Иванов И.И.",
                                      "location": "А-101", "is_event": False,
                                      "recurrence": "none"}),
    ("GET", "/api/custom_schedule", None),
    ("GET", "/api/backup", None),
    ("GET", "/api/schedule_all?group=" + GROUP + "&subgroup=0", None),
    ("GET", "/api/schedule_sync?group=" + GROUP + "&subgroup=0&force=1", None),
    ("GET", "/api/schedule.ics?group=" + GROUP + "&subgroup=0", None),
    ("GET", "/api/teachers", None),
    ("GET", "/api/teacher_schedule?slug=" + SLUG, None),
    ("GET", "/api/tracked_teachers", None),
    ("POST", "/api/tracked_teachers", {"name": "Абаев Евгений Александрович", "slug": SLUG}),
    ("GET", "/api/tracked_teachers", None),
    ("GET", "/api/search?q=Математический", None),
    ("GET", "/api/moodle/status", None),
]

HEADER_KEYS = ("Content-Type", "Cache-Control", "X-Schedule-Exhausted", "Content-Disposition")

for method, path, body in REQUESTS:
    resp = client.open(path, method=method, json=body)
    raw = resp.get_data(as_text=True)
    try:
        payload = json.loads(raw)
        body_kind = "json"
    except json.JSONDecodeError:
        payload = raw
        body_kind = "text"
    CASES.append({
        "method": method,
        "path": path,
        "request_body": body,
        "status": resp.status_code,
        "headers": {k: resp.headers.get(k) for k in HEADER_KEYS if resp.headers.get(k) is not None},
        "body_kind": body_kind,
        "body": payload,
    })

# Убираем волатильные значения, чтобы golden-файл был воспроизводимым.
for case in CASES:
    if case["body_kind"] == "text" and "DTSTAMP:" in case["body"]:
        case["body"] = re.sub(r"DTSTAMP:\d{8}T\d{6}Z", "DTSTAMP:19700101T000000Z", case["body"])
    elif isinstance(case["body"], dict) and "exported_at" in case["body"]:
        case["body"]["exported_at"] = 0

OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    json.dump({"app": "EzhMobile", "contract": "api", "cases": CASES},
              f, ensure_ascii=False, indent=2, sort_keys=False)
    f.write("\n")

print(f"cases: {len(CASES)} -> {OUT}")
bad = [c for c in CASES if c["status"] >= 500]
if bad:
    print("ВНИМАНИЕ: 5xx:", [(c["method"], c["path"]) for c in bad])
