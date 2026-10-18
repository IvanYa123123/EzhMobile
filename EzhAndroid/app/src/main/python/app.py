import os
import sys
import json
import time
import gzip
import re
import sqlite3
import secrets
import threading
import hashlib
from datetime import datetime, timezone
from urllib.parse import quote
from flask import Flask, render_template, request, jsonify, g, Response

# Заглушка для Android
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
except ImportError:
    def get_remote_address(): return "127.0.0.1"
    class Limiter:
        def __init__(self, *args, **kwargs): pass
        def limit(self, *args, **kwargs):
            def decorator(f): return f
            return decorator

from planner import SevSUPlanner
from teacher_planner import SevSUTeacherPlanner

_ANDROID_DATA = os.environ.get('EZH_DATA_DIR')
if _ANDROID_DATA:
    BASE_DIR   = _ANDROID_DATA
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
else:
    BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
    BUNDLE_DIR = BASE_DIR

DB_FILE            = os.path.join(BASE_DIR, "planner.db")
SCHEDULES_DIR      = os.path.join(BASE_DIR, "schedules")
CUSTOM_GROUPS_FILE = os.path.join(BASE_DIR, "custom_groups.json")
SYNC_TIMES_FILE    = os.path.join(BASE_DIR, ".sync_times.json")
GROUPS_FILE        = os.path.join(BUNDLE_DIR, "Group.txt")
TEMPLATES_DIR      = os.path.join(BUNDLE_DIR, "templates")
STATIC_DIR         = os.path.join(BUNDLE_DIR, "static")

def _safe_print(*args, **kwargs):
    try:
        if sys.stdout is not None: print(*args, **kwargs)
    except Exception: pass

APP_VERSION = "dev"
def _read_app_version():
    try:
        with open(os.path.join(BASE_DIR, "VERSION"), "r", encoding="utf-8") as f:
            v = f.read().strip()
            if v: return v
    except OSError: pass
    return "dev"
APP_VERSION = _read_app_version()

app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR, static_url_path='/static')
planner = SevSUPlanner()
teacher_planner = SevSUTeacherPlanner(BASE_DIR)

try: teacher_planner.start_background_refresh(interval_hours=6)
except Exception as _e: _safe_print(f"[teacher_bg] {_e}", flush=True)

MIN_SYNC_INTERVAL = 6 * 3600
os.makedirs(SCHEDULES_DIR, exist_ok=True)

limiter = Limiter(key_func=get_remote_address, app=app, default_limits=["300 per minute"], storage_uri="memory://", strategy="fixed-window")

@app.before_request
def _generate_csp_nonce():
    if request.path.startswith('/static/'): g.csp_nonce = ''; return
    g.csp_nonce = secrets.token_urlsafe(16)

@app.context_processor
def _inject_csp_nonce(): return {"csp_nonce": getattr(g, "csp_nonce", "")}
@app.context_processor
def _inject_app_version(): return {"app_version": APP_VERSION}

@app.after_request
def _security_headers(response):
    nonce = getattr(g, "csp_nonce", "")
    script_src = f"script-src 'self' 'nonce-{nonce}' https://cdn.jsdelivr.net" if nonce else "script-src 'self' https://cdn.jsdelivr.net"
    csp = ["default-src 'self'", script_src, "script-src-attr 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob:", "connect-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"]
    response.headers['Content-Security-Policy'] = "; ".join(csp)
    return response

# ============================================================
#  БАЗА ДАННЫХ
# ============================================================
_db_init_lock = threading.Lock()
_db_ready = False

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_FILE, timeout=30)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
        g.db.execute("PRAGMA journal_mode = WAL")
    return g.db

@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop('db', None)
    if db is not None: db.close()

def init_db():
    with sqlite3.connect(DB_FILE, timeout=30) as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'green')''')
        conn.execute('''CREATE TABLE IF NOT EXISTS lab_progress (group_name TEXT NOT NULL, subject TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(group_name, subject))''')
        conn.execute('''CREATE TABLE IF NOT EXISTS lab_items (id INTEGER PRIMARY KEY AUTOINCREMENT, group_name TEXT NOT NULL, subject TEXT NOT NULL, idx INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, UNIQUE(group_name, subject, idx))''')
        conn.execute('''CREATE TABLE IF NOT EXISTS friends (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, group_name TEXT NOT NULL, subgroup TEXT NOT NULL DEFAULT '0', category TEXT DEFAULT 'Мои друзья')''')
        conn.execute('''CREATE TABLE IF NOT EXISTS subject_settings (subject TEXT PRIMARY KEY, custom_name TEXT, link TEXT, teacher TEXT, location TEXT)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS custom_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, group_name TEXT, base_date TEXT, time_range TEXT, lesson TEXT, type_name TEXT, teacher TEXT, location TEXT, is_event INTEGER, recurrence TEXT, exceptions TEXT DEFAULT '[]')''')
        conn.execute('''CREATE TABLE IF NOT EXISTS tracked_teachers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE)''')
        conn.commit()

@app.before_request
def _ensure_db_initialized():
    global _db_ready
    if _db_ready: return
    with _db_init_lock:
        if not _db_ready:
            init_db()
            _db_ready = True

# ============================================================
#  УТИЛИТЫ ФАЙЛОВ
# ============================================================
_FORBIDDEN_CHARS = str.maketrans({'/': '_', '\\': '_', ':': '_', '*': '_', '?': '_', '"': '_', '<': '_', '>': '_', '|': '_'})
def make_safe_filename(name): return str(name).translate(_FORBIDDEN_CHARS).replace('..', '__').strip('. ')[:120]

def load_custom_groups():
    try:
        with open(CUSTOM_GROUPS_FILE, 'r', encoding='utf-8') as f: return json.load(f)
    except Exception: return []

def load_local_groups():
    groups = []
    try:
        with open(GROUPS_FILE, 'r', encoding='utf-8') as f:
            groups = [line.strip() for line in f if line.strip()]
    except OSError: pass
    seen = set(groups)
    for name in load_custom_groups():
        if name not in seen: seen.add(name); groups.append(name)
    return groups

# ============================================================
#  МАРШРУТЫ
# ============================================================
@app.route("/api/health")
def health(): return jsonify({"ok": True, "version": APP_VERSION})

@app.route("/")
def index(): return render_template("index.html")

@app.route("/api/groups")
def get_groups(): return jsonify(load_local_groups())

@app.route("/api/tasks", methods=["GET", "POST"])
@limiter.limit("300 per minute")
def manage_tasks():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        if not data.get('date') or not data.get('text'): return jsonify({"error": "required"}), 400
        status = data.get('status') if data.get('status') in ('green', 'orange', 'red', 'completed') else 'green'
        cursor = conn.execute("INSERT INTO tasks (date, text, status) VALUES (?, ?, ?)", (data.get('date'), data.get('text'), status))
        conn.commit()
        return jsonify({"id": cursor.lastrowid})
    start, end = request.args.get('start'), request.args.get('end')
    if not start or not end: return jsonify([])
    cursor = conn.execute("SELECT id, date, text, status FROM tasks WHERE date BETWEEN ? AND ?", (start, end))
    return jsonify([{"id": r["id"], "date": r["date"], "text": r["text"], "status": r["status"]} for r in cursor.fetchall()])

@app.route("/api/tasks/<int:task_id>", methods=["PUT", "DELETE"])
@limiter.limit("300 per minute")
def update_task(task_id):
    conn = get_db()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        conn.execute("UPDATE tasks SET date=?, status=?, text=? WHERE id=?", (data.get('date'), data.get('status'), data.get('text'), task_id))
        conn.commit()
        return jsonify({"success": True})
    conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    conn.commit()
    return jsonify({"success": True})

@app.route("/api/task_dates")
def task_dates():
    conn = get_db()
    return jsonify([r["date"] for r in conn.execute("SELECT DISTINCT date FROM tasks ORDER BY date").fetchall()])

@app.route("/api/friends", methods=["GET", "POST"])
def manage_friends():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        cursor = conn.execute("INSERT INTO friends (name, group_name, subgroup, category) VALUES (?, ?, ?, ?)", (data.get('name'), data.get('group'), str(data.get('subgroup', '0')), data.get('category', '')))
        conn.commit()
        return jsonify({"id": cursor.lastrowid})
    return jsonify([{"id": r["id"], "name": r["name"], "group": r["group_name"], "subgroup": r["subgroup"], "category": r["category"] or ""} for r in conn.execute("SELECT id, name, group_name, subgroup, category FROM friends").fetchall()])

@app.route("/api/friends/<int:friend_id>", methods=["PUT", "DELETE"])
def update_or_delete_friend(friend_id):
    conn = get_db()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        conn.execute("UPDATE friends SET name=?, group_name=?, subgroup=?, category=? WHERE id=?", (data.get('name'), data.get('group'), str(data.get('subgroup', '0')), data.get('category', ''), friend_id))
        conn.commit()
        return jsonify({"success": True})
    conn.execute("DELETE FROM friends WHERE id=?", (friend_id,))
    conn.commit()
    return jsonify({"success": True})

@app.route("/api/subjects", methods=["GET", "POST"])
def manage_subjects():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        conn.execute("INSERT OR REPLACE INTO subject_settings (subject, custom_name, link, teacher, location) VALUES (?, ?, ?, ?, ?)", (data.get('subject'), data.get('custom_name', ''), data.get('link', ''), data.get('teacher', ''), data.get('location', '')))
        conn.commit()
        return jsonify({"success": True})
    return jsonify({r["subject"]: {"custom_name": r["custom_name"], "link": r["link"], "teacher": r["teacher"], "location": r["location"]} for r in conn.execute("SELECT subject, custom_name, link, teacher, location FROM subject_settings").fetchall()})

@app.route("/api/custom_schedule", methods=["GET", "POST"])
def manage_custom_schedule():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        cursor = conn.execute("INSERT INTO custom_schedule (group_name, base_date, time_range, lesson, type_name, teacher, location, is_event, recurrence, exceptions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (data.get('group'), data.get('base_date', ''), data.get('time_range', ''), data.get('lesson'), data.get('type_name', ''), data.get('teacher', ''), data.get('location', ''), int(data.get('is_event', 0)), data.get('recurrence', 'none'), data.get('exceptions', '[]')))
        conn.commit()
        return jsonify({"id": cursor.lastrowid})
    group = request.args.get('group')
    if not group: return jsonify([])
    return jsonify([{"id": r["id"], "base_date": r["base_date"], "time_range": r["time_range"], "lesson": r["lesson"], "type_name": r["type_name"], "teacher": r["teacher"], "location": r["location"], "is_event": r["is_event"], "recurrence": r["recurrence"], "exceptions": r["exceptions"] or "[]"} for r in conn.execute("SELECT * FROM custom_schedule WHERE group_name=?", (group,)).fetchall()])

@app.route("/api/custom_schedule/<int:item_id>", methods=["PUT", "DELETE"])
def update_custom_schedule(item_id):
    conn = get_db()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        conn.execute("UPDATE custom_schedule SET base_date=?, time_range=?, lesson=?, type_name=?, teacher=?, location=?, is_event=?, recurrence=?, exceptions=? WHERE id=?", (data.get('base_date', ''), data.get('time_range', ''), data.get('lesson'), data.get('type_name', ''), data.get('teacher', ''), data.get('location', ''), int(data.get('is_event', 0)), data.get('recurrence', 'none'), data.get('exceptions', '[]'), item_id))
        conn.commit()
        return jsonify({"success": True})
    conn.execute("DELETE FROM custom_schedule WHERE id=?", (item_id,))
    conn.commit()
    return jsonify({"success": True})

# --- ВОССТАНОВЛЕННЫЕ ЛАБЫ ---
@app.route("/api/labs", methods=["GET", "POST"])
def manage_labs():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True)
        if not data: return jsonify({"error": "invalid json"}), 400
        items = data if isinstance(data, list) else [data]
        for item in items:
            group, subject = item.get('group'), item.get('subject')
            if not group or not subject: continue
            comp = max(0, int(item.get('completed', 0)))
            tot = max(0, int(item.get('total', 0)))
            if comp > tot: comp = tot
            conn.execute("INSERT OR REPLACE INTO lab_progress (group_name, subject, completed, total) VALUES (?, ?, ?, ?)", (group, subject, comp, tot))
        conn.commit()
        return jsonify({"success": True})
    group = request.args.get('group')
    if not group: return jsonify({})
    return jsonify({r["subject"]: {"completed": r["completed"], "total": r["total"]} for r in conn.execute("SELECT subject, completed, total FROM lab_progress WHERE group_name=?", (group,)).fetchall()})

def _recalc_lab_progress(conn, group, subject):
    row = conn.execute("SELECT COUNT(*) AS total, COALESCE(SUM(completed), 0) AS done FROM lab_items WHERE group_name=? AND subject=?", (group, subject)).fetchone()
    total, done = row["total"] or 0, row["done"] or 0
    if total == 0: conn.execute("DELETE FROM lab_progress WHERE group_name=? AND subject=?", (group, subject))
    else: conn.execute("INSERT OR REPLACE INTO lab_progress (group_name, subject, completed, total) VALUES (?, ?, ?, ?)", (group, subject, done, total))

@app.route("/api/lab_items", methods=["GET"])
def get_lab_items():
    group = (request.args.get('group') or '').strip()
    if not group: return jsonify({})
    conn = get_db()
    grouped = {}
    for r in conn.execute("SELECT id, subject, idx, title, completed FROM lab_items WHERE group_name=? ORDER BY subject, idx", (group,)).fetchall():
        if r["subject"] not in grouped: grouped[r["subject"]] = []
        grouped[r["subject"]].append({"id": r["id"], "idx": r["idx"], "title": r["title"], "completed": int(r["completed"])})
    return jsonify(grouped)

@app.route("/api/lab_items/sync", methods=["POST"])
def sync_lab_items():
    data = request.get_json(silent=True) or {}
    group, items = data.get('group'), data.get('items')
    if not group or not isinstance(items, list): return jsonify({"error": "required"}), 400
    conn = get_db()
    touched = set()
    for spec in items:
        subject, count = spec.get('subject'), int(spec.get('count') or 0)
        if not subject or count <= 0 or count > 200: continue
        touched.add(subject)
        existing = {r["idx"] for r in conn.execute("SELECT idx FROM lab_items WHERE group_name=? AND subject=?", (group, subject)).fetchall()}
        short = subject[subject.rfind('(')+1:subject.rfind(')')].strip() if '(' in subject else subject
        for i in range(1, count + 1):
            if i not in existing:
                conn.execute("INSERT OR IGNORE INTO lab_items (group_name, subject, idx, title, completed) VALUES (?, ?, ?, ?, 0)", (group, subject, i, f"{short}{i}"))
    for subj in touched: _recalc_lab_progress(conn, group, subj)
    conn.commit()
    return jsonify({"success": True})

@app.route("/api/lab_items/add", methods=["POST"])
def add_lab_item():
    data = request.get_json(silent=True) or {}
    group, subject = data.get('group'), data.get('subject')
    if not group or not subject: return jsonify({"error": "required"}), 400
    conn = get_db()
    next_idx = (conn.execute("SELECT COALESCE(MAX(idx), 0) FROM lab_items WHERE group_name=? AND subject=?", (group, subject)).fetchone()[0]) + 1
    short = subject[subject.rfind('(')+1:subject.rfind(')')].strip() if '(' in subject else subject
    conn.execute("INSERT INTO lab_items (group_name, subject, idx, title, completed) VALUES (?, ?, ?, ?, 0)", (group, subject, next_idx, f"{short}{next_idx}"))
    _recalc_lab_progress(conn, group, subject)
    conn.commit()
    return jsonify({"success": True})

@app.route("/api/lab_items/remove_last", methods=["POST"])
def remove_last_lab_item():
    data = request.get_json(silent=True) or {}
    group, subject = data.get('group'), data.get('subject')
    row = get_db().execute("SELECT id FROM lab_items WHERE group_name=? AND subject=? ORDER BY idx DESC LIMIT 1", (group, subject)).fetchone()
    if not row: return jsonify({"success": False}), 404
    conn = get_db()
    conn.execute("DELETE FROM lab_items WHERE id=?", (row["id"],))
    _recalc_lab_progress(conn, group, subject)
    conn.commit()
    return jsonify({"success": True})

@app.route("/api/lab_items/<int:item_id>", methods=["PUT", "DELETE"])
def update_lab_item(item_id):
    conn = get_db()
    if request.method == "DELETE":
        row = conn.execute("SELECT group_name, subject FROM lab_items WHERE id=?", (item_id,)).fetchone()
        if row:
            conn.execute("DELETE FROM lab_items WHERE id=?", (item_id,))
            _recalc_lab_progress(conn, row["group_name"], row["subject"])
            conn.commit()
        return jsonify({"success": True})
    data = request.get_json(silent=True) or {}
    row = conn.execute("SELECT group_name, subject, title, completed FROM lab_items WHERE id=?", (item_id,)).fetchone()
    if not row: return jsonify({"error": "not found"}), 404
    new_title = str(data.get('title', row["title"])).strip()[:200] or row["title"]
    new_comp = 1 if int(data.get('completed', row["completed"])) else 0
    conn.execute("UPDATE lab_items SET title=?, completed=? WHERE id=?", (new_title, new_comp, item_id))
    _recalc_lab_progress(conn, row["group_name"], row["subject"])
    conn.commit()
    return jsonify({"success": True, "title": new_title, "completed": new_comp})

# --- ОСТАЛЬНЫЕ МАРШРУТЫ ---
@app.route("/api/schedule_all")
def get_schedule_all():
    group = request.args.get('group')
    if not group: return jsonify([])
    cache_file = os.path.join(SCHEDULES_DIR, f"{make_safe_filename(group)}_{request.args.get('subgroup', '0')}.json")
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f: return jsonify(json.load(f))
        except Exception: pass
    return jsonify(planner.get_semester_schedule(group, request.args.get('subgroup', '0')))

@app.route("/api/schedule_sync")
def sync_schedule():
    group = request.args.get('group')
    if not group: return jsonify([])
    schedule = planner.get_semester_schedule(group, request.args.get('subgroup', '0'))
    cache_file = os.path.join(SCHEDULES_DIR, f"{make_safe_filename(group)}_{request.args.get('subgroup', '0')}.json")
    if schedule:
        try:
            with open(cache_file, 'w', encoding='utf-8') as f: json.dump(schedule, f, ensure_ascii=False)
        except Exception: pass
    return jsonify(schedule)

@app.route("/api/search")
def search_all():
    q = (request.args.get('q') or '').strip()
    if len(q) < 2: return jsonify({"tasks": [], "events": []})
    q_lower = q.lower()
    conn = get_db()
    tasks = [{"id": r["id"], "date": r["date"], "text": r["text"], "status": r["status"]} for r in conn.execute("SELECT * FROM tasks ORDER BY date DESC LIMIT 5000").fetchall() if q_lower in (r["text"] or "").lower()][:100]
    return jsonify({"tasks": tasks, "events": []})

@app.route("/api/schedule.ics")
def export_ics():
    group = request.args.get('group')
    if not group: return Response("Invalid group", status=400)
    cache_file = os.path.join(SCHEDULES_DIR, f"{make_safe_filename(group)}_{request.args.get('subgroup', '0')}.json")
    if not os.path.exists(cache_file): return Response("Расписание ещё не загружено.", status=409)
    try:
        with open(cache_file, 'r', encoding='utf-8') as f: schedule = json.load(f)
    except Exception: schedule = []
    if not schedule: return Response("Расписание пустое", status=409)
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ezh//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", f"X-WR-CALNAME:{group}"]
    dtstamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    for item in sorted(schedule, key=lambda x: (x.get('date', ''), x.get('n', 0) or 0)):
        date, tr = item.get('date', ''), item.get('time_range', '')
        if not date or ' - ' not in tr: continue
        date_clean = date.replace('-', '')
        try:
            start_s, end_s = tr.split(' - ')
            sh, sm = start_s.strip().split(':'); eh, em = end_s.strip().split(':')
        except ValueError: continue
        uid = hashlib.md5(f"{group}|{date}|{item.get('n')}|{item.get('lesson')}".encode('utf-8')).hexdigest()[:16] + "@ezh"
        summary = f"{item.get('type_name', '')} {item.get('lesson', '')}".strip()
        lines.extend(["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{dtstamp}", f"DTSTART:{date_clean}T{sh}{sm}00", f"DTEND:{date_clean}T{eh}{em}00", f"SUMMARY:{summary}", "END:VEVENT"])
    lines.append("END:VCALENDAR")
    return Response("\r\n".join(lines) + "\r\n", mimetype='text/calendar; charset=utf-8', headers={'Content-Disposition': f'attachment; filename="schedule_{group}.ics"', 'Cache-Control': 'no-store'})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
