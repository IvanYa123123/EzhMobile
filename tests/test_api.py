"""Регрессионные тесты HTTP API (Flask test_client, без сети)."""
import datetime

import pytest

import routes_schedule
import teacher_parser
import teacher_planner


def _fake_schedule(group="ТЕСТ/1", weeks=2):
    monday = datetime.date(2026, 11, 9)
    items = []
    for week in range(weeks):
        for day in range(7):
            items.append({
                "date": (monday + datetime.timedelta(days=week * 7 + day)).isoformat(),
                "n": 1,
                "time_range": "08:30 - 10:00",
                "lesson": "Математический анализ",
                "type_name": "Лекция",
                "teacher": "Иванов Иван Иванович",
                "location": "А-101",
                "subgroup": "0",
            })
    return items


def test_health_reports_version(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.get_json()["version"] == "0.8"


def test_index_uses_single_bundle(client):
    html = client.get("/").get_data(as_text=True)
    assert "app.bundle.js" in html
    assert "js/state.js" not in html
    assert "js/settings.js" not in html


def test_static_bundle_is_revalidated(client):
    r = client.get("/static/js/app.bundle.js")
    assert r.status_code == 200
    assert "no-cache" in r.headers["Cache-Control"]
    assert "immutable" not in r.headers["Cache-Control"]


def test_csp_header(client):
    r = client.get("/")
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]


def test_tasks_crud(client):
    r = client.post("/api/tasks", json={"date": "2026-11-12", "text": "Тест"})
    assert r.status_code == 200
    task_id = r.get_json()["id"]
    r = client.put(f"/api/tasks/{task_id}",
                   json={"date": "2026-11-12", "text": "Тест", "status": "completed"})
    assert r.status_code == 200
    assert client.delete(f"/api/tasks/{task_id}").status_code == 200


def test_friends_without_category(client):
    r = client.post("/api/friends", json={
        "name": "Друг Тест", "group": "ПИН/б-24-2-о", "subgroup": "1"})
    assert r.status_code == 200
    friend_id = r.get_json()["id"]

    friends = client.get("/api/friends").get_json()
    friend = next(f for f in friends if f["id"] == friend_id)
    assert friend["subgroup"] == "1"
    assert "category" not in friend

    # старые бэкапы/клиенты присылали category — поле просто игнорируется
    r = client.put(f"/api/friends/{friend_id}", json={
        "name": "Друг Тест 2", "group": "ПИН/б-24-2-о", "subgroup": "2",
        "category": "старая папка"})
    assert r.status_code == 200


def test_backup_roundtrip(client):
    client.post("/api/tasks", json={"date": "2026-11-13", "text": "Из бэкапа"})
    backup = client.get("/api/backup").get_json()
    assert backup["app"] == "EZHednevnik"
    assert backup["tables"]["tasks"]
    r = client.post("/api/backup", json=backup)
    assert r.status_code == 200
    assert r.get_json()["success"] is True


def test_schedule_exhausted_is_not_marked(client, monkeypatch):
    group, subgroup = "ТЕСТ-EXH", "0"
    key = f"{group}_{subgroup}"
    monkeypatch.setattr(routes_schedule.planner, "get_semester_schedule",
                        lambda g, s="0", max_weeks=25: (_fake_schedule(), True))

    r = client.get(f"/api/schedule_sync?group={group}&subgroup={subgroup}&force=1")
    assert r.status_code == 200
    assert r.headers.get("X-Schedule-Exhausted") == "1"
    assert routes_schedule._needs_sync(key) is True

    monkeypatch.setattr(routes_schedule.planner, "get_semester_schedule",
                        lambda g, s="0", max_weeks=25: (_fake_schedule(), False))
    r = client.get(f"/api/schedule_sync?group={group}&subgroup={subgroup}&force=1")
    assert r.status_code == 200
    assert "X-Schedule-Exhausted" not in r.headers
    assert routes_schedule._needs_sync(key) is False


def test_schedule_ics_409_then_200(client, monkeypatch):
    group, subgroup = "ТЕСТ-ICS", "0"
    r = client.get(f"/api/schedule.ics?group={group}&subgroup={subgroup}")
    assert r.status_code == 409

    monkeypatch.setattr(routes_schedule.planner, "get_semester_schedule",
                        lambda g, s="0", max_weeks=25: (_fake_schedule(), False))
    assert client.get(f"/api/schedule_sync?group={group}&subgroup={subgroup}&force=1").status_code == 200
    r = client.get(f"/api/schedule.ics?group={group}&subgroup={subgroup}")
    assert r.status_code == 200
    assert "BEGIN:VCALENDAR" in r.get_data(as_text=True)


def test_teachers_list_cached_when_site_is_down(client, monkeypatch, flask_app):
    monkeypatch.setattr(teacher_planner.SevSUTeacherPlanner, "_fetch_teachers_from_site",
                        lambda self: [])
    import time
    started = time.time()
    r = client.get("/api/teachers")
    elapsed = time.time() - started
    assert r.status_code == 200
    teachers = r.get_json()
    assert len(teachers) >= 900
    assert all(teacher_parser.is_person_name(t["name"]) for t in teachers)
    assert elapsed < 3, f"список преподавателей должен отдаваться из кэша, а не ждать сайт ({elapsed:.1f}s)"


def test_person_name_filter():
    assert teacher_parser.is_person_name("Абаев Евгений Александрович")
    assert teacher_parser.is_person_name("2 - доц - внеш - Исаев")
    assert not teacher_parser.is_person_name("Вакансия УПП")
    assert not teacher_parser.is_person_name("0 - ОМР")


def test_moodle_status(client):
    assert client.get("/api/moodle/status").status_code == 200


def test_rate_limit(client):
    codes = [client.get("/api/backup").status_code for _ in range(20)]
    assert 429 in codes
    assert 200 in codes
