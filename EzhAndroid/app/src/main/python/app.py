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

# --- Заглушка для Android (чтобы не падало без flask-limiter) ---
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
# ---------------------------------------------------------------

from planner import SevSUPlanner
from teacher_planner import SevSUTeacherPlanner

# ============================================================
#  ОПРЕДЕЛЕНИЕ ПУТЕЙ (Android)
# ============================================================
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
        if sys.stdout is not None:
            print(*args, **kwargs)
    except Exception:
        pass

# ============================================================
#  ВЕРСИЯ ПРИЛОЖЕНИЯ
# ============================================================
APP_VERSION = "dev"
def _read_app_version():
    try:
        with open(os.path.join(BASE_DIR, "VERSION"), "r", encoding="utf-8") as f:
            v = f.read().strip()
            if v: return v
    except OSError: pass
    return "dev"
APP_VERSION = _read_app_version()

# ============================================================
#  FLASK
# ============================================================
app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR, static_url_path='/static')
planner = SevSUPlanner()
teacher_planner = SevSUTeacherPlanner(BASE_DIR)

try: teacher_planner.start_background_refresh(interval_hours=6)
except Exception as _e: _safe_print(f"[teacher_bg] {_e}", flush=True)

MIN_SYNC_INTERVAL = 6 * 3600
os.makedirs(SCHEDULES_DIR, exist_ok=True)

# ============================================================
#  RATE LIMITING
# ============================================================
limiter = Limiter(key_func=get_remote_address, app=app, default_limits=["300 per minute"], storage_uri="memory://", strategy="fixed-window")

# ============================================================
#  CSP NONCE + VERSION
# ============================================================
@app.before_request
def _generate_csp_nonce():
    if request.path.startswith('/static/'):
        g.csp_nonce = ''
        return
    g.csp_nonce = secrets.token_urlsafe(16)

@app.context_processor
def _inject_csp_nonce(): return {"csp_nonce": getattr(g, "csp_nonce", "")}
@app.context_processor
def _inject_app_version(): return {"app_version": APP_VERSION}

# ============================================================
#  GZIP + SECURITY HEADERS
# ============================================================
_GZIP_MIN_SIZE = 1024
_GZIP_TYPES = ('application/json', 'text/html', 'text/plain', 'text/css', 'application/javascript', 'text/javascript', 'image/svg+xml')

@app.after_request
def _gzip_response(response):
    if (response.status_code < 200 or response.status_code >= 300 or response.direct_passthrough or response.headers.get('Content-Encoding')): return response
    if 'gzip' not in request.headers.get('Accept-Encoding', ''): return response
    ctype = (response.content_type or '').split(';', 1)[0].strip().lower()
    if ctype not in _GZIP_TYPES: return response
    data = response.get_data()
    if len(data) < _GZIP_MIN_SIZE: return response
    compressed = gzip.compress(data, compresslevel=5)
    if len(compressed) >= len(data): return response
    response.set_data(compressed)
    response.headers['Content-Encoding'] = 'gzip'
    response.headers['Content-Length'] = str(len(compressed))
    response.headers.add('Vary', 'Accept-Encoding')
    return response

@app.after_request
def _security_headers(response):
    nonce = getattr(g, "csp_nonce", "")
    script_src = f"script-src 'self' 'nonce-{nonce}' https://cdn.jsdelivr.net" if nonce else "script-src 'self' https://cdn.jsdelivr.net"
    csp = ["default-src 'self'", script_src, "script-src-attr 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob:", "connect-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"]
    response.headers['Content-Security-Policy'] = "; ".join(csp)
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    response.headers.pop('Server', None)
    if request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
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
        g.db.execute("PRAGMA busy_timeout = 5000")
        g.db.execute("PRAGMA cache_size = -64000")
        g.db.execute("PRAGMA mmap_size = 268435456")
        g.db.execute("PRAGMA temp_store = MEMORY")
        g.db.execute("PRAGMA synchronous = NORMAL")
    return g.db

@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop('db', None)
    if db is not None: db.close()

def _column_exists(conn, table, column):
    return any(r[1] == column for r in conn.execute(f"PRAGMA table_info({table})").fetchall())

def _add_column_if_missing(conn, table, column, ddl):
    if not _column_exists(conn, table, column):
        try: conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
        except sqlite3.OperationalError as e:
            if "duplicate column" not in str(e).lower(): raise

def init_db(retries: int = 5):
    last_err = None
    for attempt in range(retries):
        try:
            with sqlite3.connect(DB_FILE, timeout=30) as conn:
                conn.execute("PRAGMA journal_mode = WAL")
                conn.execute("PRAGMA synchronous = NORMAL")
                conn.execute('''CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'green')''')
                conn.execute('''CREATE TABLE IF NOT EXISTS lab_progress (group_name TEXT NOT NULL, subject TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(group_name, subject))''')
                conn.execute('''CREATE TABLE IF NOT EXISTS lab_items (id INTEGER PRIMARY KEY AUTOINCREMENT, group_name TEXT NOT NULL, subject TEXT NOT NULL, idx INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, UNIQUE(group_name, subject, idx))''')
                conn.execute('''CREATE TABLE IF NOT EXISTS friends (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, group_name TEXT NOT NULL, subgroup TEXT NOT NULL DEFAULT '0', category TEXT DEFAULT 'Мои друзья')''')
                conn.execute('''CREATE TABLE IF NOT EXISTS subject_settings (subject TEXT PRIMARY KEY, custom_name TEXT, link TEXT)''')
                conn.execute('''CREATE TABLE IF NOT EXISTS custom_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, group_name TEXT, base_date TEXT, time_range TEXT, lesson TEXT, type_name TEXT, teacher TEXT, location TEXT, is_event INTEGER, recurrence TEXT, exceptions TEXT DEFAULT '[]')''')
                conn.execute('''CREATE TABLE IF NOT EXISTS tracked_teachers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE)''')
                conn.execute('''CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)''')

                _add_column_if_missing(conn, "subject_settings", "teacher", "TEXT")
                _add_column_if_missing(conn, "subject_settings", "location", "TEXT")
                _add_column_if_missing(conn, "friends", "category", "TEXT DEFAULT 'Мои друзья'")
                _add_column_if_missing(conn, "custom_schedule", "exceptions", "TEXT DEFAULT '[]'")

                conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_lab_items_group ON lab_items(group_name, subject)")
                conn.commit()
                return
        except sqlite3.OperationalError as e:
            last_err = e
            if attempt < retries - 1: time.sleep(0.2 * (attempt + 1))
            else: raise
    if last_err: raise last_err

# ============================================================
#  МИГРАЦИЯ ПЗ ↔ ЛЗ
# ============================================================
_MIGRATION_PS_LZ_KEY = 'ps_lz_swap_v1'

def _swap_ps_lz_suffix(subject):
    if not subject or '(' not in subject or not subject.endswith(')'): return subject
    i = subject.rfind('(')
    base = subject[:i].rstrip()
    suffix = subject[i + 1:-1].strip()
    if suffix == 'ЛЗ': return f"{base} (ПЗ)"
    if suffix == 'ПЗ': return f"{base} (ЛЗ)"
    return subject

def _migrate_ps_lz_swap():
    conn = sqlite3.connect(DB_FILE, timeout=30)
    try:
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)")
        if conn.execute("SELECT value FROM _meta WHERE key=?", (_MIGRATION_PS_LZ_KEY,)).fetchone(): return

        try: filenames = [f for f in os.listdir(SCHEDULES_DIR) if f.endswith('.json')]
        except OSError: filenames = []

        for fname in filenames:
            path = os.path.join(SCHEDULES_DIR, fname)
            try:
                with open(path, 'r', encoding='utf-8') as f: data = json.load(f)
            except (OSError, json.JSONDecodeError): continue
            if not isinstance(data, list): continue

            changed = False
            for item in data:
                tn = item.get('type_name')
                if tn == 'ЛЗ': item['type_name'] = 'ПЗ'; changed = True
                elif tn == 'ПЗ': item['type_name'] = 'ЛЗ'; changed = True
            if not changed: continue

            try:
                tmp = path + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False)
                os.replace(tmp, path)
            except OSError: pass

        rows = conn.execute("SELECT id, subject FROM lab_items").fetchall()
        for r in rows:
            new_subj = _swap_ps_lz_suffix(r[1])
            if new_subj != r[1]: conn.execute("UPDATE lab_items SET subject=? WHERE id=?", (new_subj, r[0]))

        rows = conn.execute("SELECT group_name, subject, completed, total FROM lab_progress").fetchall()
        for r in rows:
            new_subj = _swap_ps_lz_suffix(r[1])
            if new_subj != r[1]:
                conn.execute("DELETE FROM lab_progress WHERE group_name=? AND subject=?", (r[0], r[1]))
                conn.execute("INSERT OR REPLACE INTO lab_progress (group_name, subject, completed, total) VALUES (?, ?, ?, ?)", (r[0], new_subj, r[2], r[3]))

        conn.execute("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)", (_MIGRATION_PS_LZ_KEY, str(int(time.time()))))
        conn.commit()
    except sqlite3.Error: pass
    finally: conn.close()

@app.before_request
def _ensure_db_initialized():
    global _db_ready
    if _db_ready: return
    with _db_init_lock:
        if not _db_ready:
            init_db()
            _migrate_ps_lz_swap()
            _db_ready = True

# ============================================================
#  КЭШИРОВАНИЕ ФАЙЛОВ
# ============================================================
class _MtimeJsonCache:
    __slots__ = ('path', 'lock', '_mtime', '_value', '_loaded')
    def __init__(self, path):
        self.path = path
        self.lock = threading.RLock()
        self._mtime = None
        self._value = None
        self._loaded = False
    def _mtime_now(self):
        try: return os.path.getmtime(self.path)
        except OSError: return None
    def read(self, default_factory=list):
        mt = self._mtime_now()
        with self.lock:
            if not self._loaded or mt != self._mtime:
                if mt is None: self._value = default_factory()
                else:
                    try:
                        with open(self.path, 'r', encoding='utf-8') as f: self._value = json.load(f)
                    except (json.JSONDecodeError, OSError): self._value = default_factory()
                self._mtime = mt
                self._loaded = True
            return self._value
    def write(self, value, ensure_ascii=False, indent=None):
        with self.lock:
            try:
                tmp = self.path + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f: json.dump(value, f, ensure_ascii=ensure_ascii, indent=indent)
                os.replace(tmp, self.path)
                self._value = value
                self._mtime = self._mtime_now()
                self._loaded = True
            except OSError: pass

_custom_groups_cache = _MtimeJsonCache(CUSTOM_GROUPS_FILE)
_groups_txt_lock = threading.RLock()
_groups_txt_mtime = None
_groups_txt_data = None
_groups_txt_loaded = False

def _read_groups_txt():
    global _groups_txt_mtime, _groups_txt_data, _groups_txt_loaded
    try: mt = os.path.getmtime(GROUPS_FILE)
    except OSError: mt = None
    with _groups_txt_lock:
        if not _groups_txt_loaded or mt != _groups_txt_mtime:
            if mt is None: _groups_txt_data = []
            else:
                names, seen = [], set()
                try:
                    with open(GROUPS_FILE, 'r', encoding='utf-8') as f:
                        for line in f:
                            name = line.strip()
                            if name and name not in seen: seen.add(name); names.append(name)
                except OSError: pass
                _groups_txt_data = names
            _groups_txt_mtime = mt
            _groups_txt_loaded = True
        return _groups_txt_data

# ============================================================
#  ВАЛИДАЦИЯ
# ============================================================
_VALID_SUBGROUPS = frozenset(("0", "1", "2"))
_GROUP_RE = re.compile(r'^[A-Za-zА-Яа-яЁё0-9/._\-]{1,64}$')
_SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9\-]{0,80}[a-z0-9]$')
_FORBIDDEN_CHARS = str.maketrans({'/': '_', '\\': '_', ':': '_', '*': '_', '?': '_', '"': '_', '<': '_', '>': '_', '|': '_'})

def validate_subgroup(raw) -> str:
    s = str(raw if raw is not None else "0").strip()
    return s if s in _VALID_SUBGROUPS else "0"
def validate_group(raw) -> str:
    s = str(raw or "").strip()
    if not s: raise ValueError("group required")
    if len(s) > 64: raise ValueError("group too long")
    if not _GROUP_RE.match(s): raise ValueError("invalid group format")
    return s
def make_safe_filename(name):
    return str(name).translate(_FORBIDDEN_CHARS).replace('..', '__').strip('. ')[:120]
def load_custom_groups():
    data = _custom_groups_cache.read(default_factory=list)
    if isinstance(data, list): return [str(x).strip() for x in data if str(x).strip()]
    return []
def save_custom_groups(groups): _custom_groups_cache.write(groups, ensure_ascii=False, indent=2)
def load_local_groups():
    groups = list(_read_groups_txt())
    seen = set(groups)
    for name in load_custom_groups():
        if name and name not in seen: seen.add(name); groups.append(name)
    return groups

# ============================================================
#  ТРОТТЛИНГ СИНХРОНИЗАЦИИ
# ============================================================
_sync_times_cache = _MtimeJsonCache(SYNC_TIMES_FILE)
def _needs_sync(key):
    data = _sync_times_cache.read(default_factory=dict)
    last = data.get(key, 0) if isinstance(data, dict) else 0
    return (time.time() - last) > MIN_SYNC_INTERVAL
def _mark_synced(key):
    with _sync_times_cache.lock:
        data = _sync_times_cache.read(default_factory=dict)
        if not isinstance(data, dict): data = {}
        data[key] = time.time()
        _sync_times_cache.write(data)

# ============================================================
#  МАРШРУТЫ
# ============================================================
@app.route("/api/health")
def health(): return jsonify({"ok": True, "version": APP_VERSION})
@app.route("/")
def index(): return render_template("index.html")
@app.route("/api/groups")
def get_groups(): return jsonify(load_local_groups())
@app.route("/api/groups/custom", methods=["POST"])
def add_custom_group():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name: return jsonify({"success": False, "error": "empty name"}), 400
    try: name = validate_group(name)
    except ValueError as e: return jsonify({"success": False, "error": str(e)}), 400
    if any(g.lower() == name.lower() for g in load_local_groups()): return jsonify({"success": True, "already": True})
    custom = load_custom_groups()
    if not any(g.lower() == name.lower() for g in custom): custom.append(name); save_custom_groups(custom)
    return jsonify({"success": True})

@app.route("/api/schedule_all")
def get_schedule_all():
    try: group = validate_group(request.args.get('group'))
    except ValueError: return jsonify([])
    subgroup = validate_subgroup(request.args.get('subgroup', '0'))
    cache_file = os.path.join(SCHEDULES_DIR, f"{make_safe_filename(group)}_{subgroup}.json")
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f: return jsonify(json.load(f))
        except (json.JSONDecodeError, OSError): pass
    schedule = planner.get_semester_schedule(group, subgroup)
    if schedule:
        try:
            tmp = cache_file + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f: json.dump(schedule, f, ensure_ascii=False)
            os.replace(tmp, cache_file)
        except OSError: pass
    return jsonify(schedule)

@app.route("/api/schedule_sync")
def sync_schedule():
    try: group = validate_group(request.args.get('group'))
    except ValueError: return jsonify([])
    subgroup = validate_subgroup(request.args.get('subgroup', '0'))
    force = request.args.get('force') == '1'
    sync_key = f"{group}_{subgroup}"
    if not force and not _needs_sync(sync_key): return jsonify([])

    schedule = planner.get_semester_schedule(group, subgroup)
    cache_file = os.path.join(SCHEDULES_DIR, f"{make_safe_filename(group)}_{subgroup}.json")
    if schedule:
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f: old_schedule = json.load(f)
                if len(schedule) < len(old_schedule) * 0.9: return jsonify(old_schedule)
            except (json.JSONDecodeError, OSError): pass
        try:
            tmp = cache_file + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f: json.dump(schedule, f, ensure_ascii=False)
            os.replace(tmp, cache_file)
        except OSError: pass
        _mark_synced(sync_key)
    else:
        if not os.path.exists(cache_file): _mark_synced(sync_key)
    return jsonify(schedule)

@app.route("/api/tasks", methods=["GET", "POST"])
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
    return jsonify([{"id": r["id"], "date": r["date"], "text": r["text"], "status": r["status"]} for r in conn.execute("SELECT * FROM tasks WHERE date BETWEEN ? AND ?", (start, end)).fetchall()])

@app.route("/api/tasks/<int:task_id>", methods=["PUT", "DELETE"])
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
def task_dates(): return jsonify([r["date"] for r in get_db().execute("SELECT DISTINCT date FROM tasks ORDER BY date").fetchall()])

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
    grouped = {}
    for r in get_db().execute("SELECT id, subject, idx, title, completed FROM lab_items WHERE group_name=? ORDER BY subject, idx", (group,)).fetchall():
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
            if i not in existing: conn.execute("INSERT OR IGNORE INTO lab_items (group_name, subject, idx, title, completed) VALUES (?, ?, ?, ?, 0)", (group, subject, i, f"{short}{i}"))
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

@app.route("/api/friends", methods=["GET", "POST"])
def manage_friends():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        if not data.get('name') or not data.get('group'): return jsonify({"error": "required"}), 400
        try: group = validate_group(data.get('group'))
        except ValueError as e: return jsonify({"error": str(e)}), 400
        cursor = conn.execute("INSERT INTO friends (name, group_name, subgroup, category) VALUES (?, ?, ?, ?)", (data.get('name'), group, str(data.get('subgroup', '0')), data.get('category', '')))
        conn.commit()
        return jsonify({"id": cursor.lastrowid})
    return jsonify([{"id": r["id"], "name": r["name"], "group": r["group_name"], "subgroup": r["subgroup"], "category": r["category"] or ""} for r in conn.execute("SELECT * FROM friends").fetchall()])

@app.route("/api/friends/<int:friend_id>", methods=["PUT", "DELETE"])
def update_or_delete_friend(friend_id):
    conn = get_db()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        try: group = validate_group(data.get('group'))
        except ValueError as e: return jsonify({"error": str(e)}), 400
        conn.execute("UPDATE friends SET name=?, group_name=?, subgroup=?, category=? WHERE id=?", (data.get('name'), group, str(data.get('subgroup', '0')), data.get('category', ''), friend_id))
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
    return jsonify({r["subject"]: {"custom_name": r["custom_name"], "link": r["link"], "teacher": r["teacher"], "location": r["location"]} for r in conn.execute("SELECT * FROM subject_settings").fetchall()})

@app.route("/api/custom_schedule", methods=["GET", "POST"])
def manage_custom_schedule():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        try: group = validate_group(data.get('group'))
        except ValueError as e: return jsonify({"error": str(e)}), 400
        cursor = conn.execute("INSERT INTO custom_schedule (group_name, base_date, time_range, lesson, type_name, teacher, location, is_event, recurrence, exceptions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (group, data.get('base_date', ''), data.get('time_range', ''), data.get('lesson'), data.get('type_name', ''), data.get('teacher', ''), data.get('location', ''), int(data.get('is_event', 0)), data.get('recurrence', 'none'), data.get('exceptions', '[]')))
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

@app.route("/api/search")
def search_all():
    q = (request.args.get('q') or '').strip()
    if len(q) < 2: return jsonify({"tasks": [], "events": [], "query": q, "count": 0})
    q_lower = q.lower()
    conn = get_db()
    tasks = [{"id": r["id"], "date": r["date"], "text": r["text"], "status": r["status"]} for r in conn.execute("SELECT * FROM tasks ORDER BY date DESC LIMIT 5000").fetchall() if q_lower in (r["text"] or "").lower()][:100]
    events = []
    for r in conn.execute("SELECT * FROM custom_schedule ORDER BY base_date DESC LIMIT 5000").fetchall():
        if q_lower in " ".join([r["lesson"] or "", r["type_name"] or "", r["teacher"] or "", r["location"] or ""]).lower():
            events.append({"id": r["id"], "group_name": r["group_name"], "base_date": r["base_date"], "time_range": r["time_range"], "lesson": r["lesson"], "type_name": r["type_name"], "teacher": r["teacher"], "location": r["location"], "is_event": r["is_event"], "recurrence": r["recurrence"]})
            if len(events) >= 100: break
    return jsonify({"tasks": tasks, "events": events, "query": q, "count": len(tasks) + len(events)})

@app.route("/api/schedule.ics")
def export_ics():
    try: group = validate_group(request.args.get('group'))
    except ValueError: return Response("Invalid group", status=400)
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

@app.route("/api/teachers")
def get_teachers():
    try: return jsonify(teacher_planner.get_teachers(force=request.args.get('force') == '1'))
    except Exception: return jsonify([])

@app.route("/api/teacher_schedule")
def get_teacher_schedule():
    slug = (request.args.get('slug') or '').strip()
    if not slug: return jsonify([])
    try: return jsonify(teacher_planner.get_teacher_schedule(slug, force=request.args.get('force') == '1'))
    except Exception: return jsonify([])

@app.route("/api/tracked_teachers", methods=["GET", "POST"])
def manage_tracked_teachers():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        slug = (data.get('slug') or '').strip().lower()
        if not name or not slug or not _SLUG_RE.match(slug) or len(name) > 200: return jsonify({"error": "invalid data"}), 400
        cursor = conn.execute("INSERT OR IGNORE INTO tracked_teachers (name, slug) VALUES (?, ?)", (name, slug))
        conn.commit()
        if cursor.lastrowid: return jsonify({"id": cursor.lastrowid, "name": name, "slug": slug})
        row = conn.execute("SELECT id FROM tracked_teachers WHERE slug=?", (slug,)).fetchone()
        return jsonify({"id": row["id"], "name": name, "slug": slug, "already": True})
    return jsonify([{"id": r["id"], "name": r["name"], "slug": r["slug"]} for r in conn.execute("SELECT id, name, slug FROM tracked_teachers ORDER BY id").fetchall()])

@app.route("/api/tracked_teachers/<int:item_id>", methods=["DELETE"])
def delete_tracked_teacher(item_id):
    conn = get_db()
    conn.execute("DELETE FROM tracked_teachers WHERE id=?", (item_id,))
    conn.commit()
    return jsonify({"success": True})
