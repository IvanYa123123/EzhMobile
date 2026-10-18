import os, sys, json, time, gzip, re, sqlite3, secrets, threading, hashlib
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify, g, Response

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
    BASE_DIR = _ANDROID_DATA
    BUNDLE_DIR = os.path.dirname(os.path.realpath(__file__))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    BUNDLE_DIR = BASE_DIR

DB_FILE = os.path.join(BASE_DIR, "planner.db")
SCHEDULES_DIR = os.path.join(BASE_DIR, "schedules")
CUSTOM_GROUPS_FILE = os.path.join(BASE_DIR, "custom_groups.json")
SYNC_TIMES_FILE = os.path.join(BASE_DIR, ".sync_times.json")
GROUPS_FILE = os.path.join(BUNDLE_DIR, "Group.txt")
TEMPLATES_DIR = os.path.join(BUNDLE_DIR, "templates")
STATIC_DIR = os.path.join(BUNDLE_DIR, "static")

# Как часто разрешаем реальный запрос в СевГУ при /api/schedule_sync без force=1
MIN_SYNC_INTERVAL = 6 * 3600

APP_VERSION = "0.62"
try:
    with open(os.path.join(BASE_DIR, "VERSION"), "r", encoding="utf-8") as f:
        APP_VERSION = f.read().strip() or "0.62"
except OSError:
    pass

def _safe_print(*args, **kwargs):
    try:
        if sys.stdout is not None:
            print(*args, **kwargs)
    except Exception:
        pass

app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR, static_url_path='/static')
planner = SevSUPlanner()
teacher_planner = SevSUTeacherPlanner(BASE_DIR)
os.makedirs(SCHEDULES_DIR, exist_ok=True)

limiter = Limiter(key_func=get_remote_address, app=app, default_limits=["300 per minute"], storage_uri="memory://", strategy="fixed-window")

@app.before_request
def _generate_csp_nonce():
    g.csp_nonce = '' if request.path.startswith('/static/') else secrets.token_urlsafe(16)

@app.context_processor
def _inject_nonce(): return {"csp_nonce": getattr(g, "csp_nonce", "")}

@app.context_processor
def _inject_version(): return {"app_version": APP_VERSION}

@app.after_request
def _headers(response):
    nonce = getattr(g, "csp_nonce", "")
    script_src = f"script-src 'self' 'nonce-{nonce}' https://cdn.jsdelivr.net" if nonce else "script-src 'self' https://cdn.jsdelivr.net"
    csp = [
        "default-src 'self'",
        script_src,
        "script-src-attr 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        "connect-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'"
    ]
    response.headers['Content-Security-Policy'] = "; ".join(csp)
    return response

_db_ready = False
_db_lock = threading.Lock()

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
    if db is not None:
        db.close()

def init_db():
    with sqlite3.connect(DB_FILE, timeout=30) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, text TEXT, status TEXT)')
        conn.execute('CREATE TABLE IF NOT EXISTS lab_progress (group_name TEXT, subject TEXT, completed INTEGER, total INTEGER, PRIMARY KEY(group_name, subject))')
        conn.execute('CREATE TABLE IF NOT EXISTS lab_items (id INTEGER PRIMARY KEY AUTOINCREMENT, group_name TEXT, subject TEXT, idx INTEGER, title TEXT, completed INTEGER, UNIQUE(group_name, subject, idx))')
        conn.execute('CREATE TABLE IF NOT EXISTS friends (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, group_name TEXT, subgroup TEXT, category TEXT)')
        conn.execute('CREATE TABLE IF NOT EXISTS subject_settings (subject TEXT PRIMARY KEY, custom_name TEXT, link TEXT, teacher TEXT, location TEXT)')
        conn.execute('CREATE TABLE IF NOT EXISTS custom_schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, group_name TEXT, base_date TEXT, time_range TEXT, lesson TEXT, type_name TEXT, teacher TEXT, location TEXT, is_event INTEGER, recurrence TEXT, exceptions TEXT)')
        conn.execute('CREATE TABLE IF NOT EXISTS tracked_teachers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, slug TEXT UNIQUE)')
        conn.commit()

@app.before_request
def _ensure_db():
    global _db_ready
    if not _db_ready:
        with _db_lock:
            if not _db_ready:
                init_db()
                _db_ready = True

_FORBIDDEN = str.maketrans({'/': '_', '\\': '_', ':': '_', '*': '_', '?': '_', '"': '_', '<': '_', '>': '_', '|': '_'})
def make_safe_filename(name):
    return str(name).translate(_FORBIDDEN).replace('..', '__').strip('. ')[:120]

# ============================================================
#  ТРОТТЛИНГ СИНХРОНИЗАЦИИ
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
        try:
            return os.path.getmtime(self.path)
        except OSError:
            return None

    def read(self, default_factory=dict):
        mt = self._mtime_now()
        with self.lock:
            if not self._loaded or mt != self._mtime:
                if mt is None:
                    self._value = default_factory()
                else:
                    try:
                        with open(self.path, 'r', encoding='utf-8') as f:
                            self._value = json.load(f)
                    except (json.JSONDecodeError, OSError):
                        self._value = default_factory()
                self._mtime = mt
                self._loaded = True
            return self._value

    def write(self, value, ensure_ascii=False, indent=None):
        with self.lock:
            try:
                tmp = self.path + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    json.dump(value, f, ensure_ascii=ensure_ascii, indent=indent)
                os.replace(tmp, self.path)
                self._value = value
                self._mtime = self._mtime_now()
                self._loaded = True
            except OSError:
                pass

_sync_times_cache = _MtimeJsonCache(SYNC_TIMES_FILE)

def _needs_sync(key):
    data = _sync_times_cache.read(default_factory=dict)
    last = data.get(key, 0) if isinstance(data, dict) else 0
    return (time.time() - last) > MIN_SYNC_INTERVAL

def _mark_synced(key):
    cache = _sync_times_cache
    with cache.lock:
        data = cache.read(default_factory=dict)
        if not isinstance(data, dict):
            data = {}
        data[key] = time.time()
        cache.write(data)

# ============================================================
#  ВАЛИДАЦИЯ ГРУПП
# ============================================================

_VALID_SUBGROUPS = frozenset(("0", "1", "2"))
_GROUP_RE = re.compile(r'^[A-Za-zА-Яа-яЁё0-9/._\-]{1,64}$')

def validate_subgroup(raw):
    s = str(raw if raw is not None else "0").strip()
    return s if s in _VALID_SUBGROUPS else "0"

def validate_group(raw):
    s = str(raw or "").strip()
    if not s:
        raise ValueError("group required")
    if len(s) > 64:
        raise ValueError("group too long")
    if not _GROUP_RE.match(s):
        raise ValueError("invalid group format")
    return s

# ============================================================
#  CUSTOM GROUPS
# ============================================================

def load_custom_groups():
    try:
        with open(CUSTOM_GROUPS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []

def save_custom_groups(groups):
    try:
        with open(CUSTOM_GROUPS_FILE, 'w', encoding='utf-8') as f:
            json.dump(groups, f, ensure_ascii=False, indent=2)
        return True
    except OSError:
        return False

# ============================================================
#  HEALTH / INDEX
# ============================================================

@app.route("/api/health")
def health():
    return jsonify({"ok": True, "version": APP_VERSION})

@app.route("/")
def index():
    return render_template("index.html")

# ============================================================
#  GROUPS
# ============================================================

@app.route("/api/groups")
@limiter.limit("60 per minute")
def get_groups():
    groups = []
    try:
        with open(GROUPS_FILE, 'r', encoding='utf-8') as f:
            groups = [line.strip() for line in f if line.strip()]
    except OSError as e:
        _safe_print(f"[groups] Ошибка чтения {GROUPS_FILE}: {e}")

    if not groups:
        _safe_print("[groups] Group.txt пуст или не найден, качаем с сайта...")
        try:
            params = {"v": "6.2", "section": "0"}
            r = planner.session.get(planner.groups_api, params=params, timeout=10)
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list):
                    if len(data) > 0 and isinstance(data[0], dict):
                        groups = [item.get('name') or item.get('title') or str(item) for item in data]
                    else:
                        groups = data
        except Exception as e:
            _safe_print(f"[groups] Failed to load groups from web: {e}")

    seen = set(groups)
    for name in load_custom_groups():
        if name not in seen:
            seen.add(name)
            groups.append(name)

    resp = jsonify(groups)
    resp.headers['Cache-Control'] = 'public, max-age=3600'
    return resp

@app.route("/api/groups/custom", methods=["POST"])
@limiter.limit("30 per minute")
def add_custom_group():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({"error": "empty"}), 400
    try:
        name = validate_group(name)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    groups = load_custom_groups()
    if name in groups:
        return jsonify({"success": True, "already": True})
    groups.append(name)
    if not save_custom_groups(groups):
        return jsonify({"error": "save failed"}), 500
    return jsonify({"success": True})

# ============================================================
#  TASKS
# ============================================================

@app.route("/api/tasks", methods=["GET", "POST"])
@limiter.limit("300 per minute")
def manage_tasks():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        date = (data.get('date') or '').strip()
        text = (data.get('text') or '').strip()
        status = (data.get('status') or 'green').strip()
        if not date or not text:
            return jsonify({"error": "required"}), 400
        if len(text) > 2000:
            return jsonify({"error": "text too long"}), 400
        if status not in ('green', 'orange', 'red', 'completed'):
            status = 'green'
        cursor = conn.execute(
            "INSERT INTO tasks (date, text, status) VALUES (?, ?, ?)",
            (date, text, status))
        conn.commit()
        return jsonify({"id": cursor.lastrowid})
    start, end = request.args.get('start'), request.args.get('end')
    if not start or not end:
        return jsonify([])
    cursor = conn.execute(
        "SELECT id, date, text, status FROM tasks WHERE date BETWEEN ? AND ?",
        (start, end))
    return jsonify([{"id": r["id"], "date": r["date"], "text": r["text"], "status": r["status"]} for r in cursor.fetchall()])

@app.route("/api/tasks/<int:task_id>", methods=["PUT", "DELETE"])
@limiter.limit("300 per minute")
def update_task(task_id):
    conn = get_db()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        date = (data.get('date') or '').strip()
        text = (data.get('text') or '').strip()
        status = (data.get('status') or 'green').strip()
        if not date or not text:
            return jsonify({"error": "required"}), 400
        if len(text) > 2000:
            return jsonify({"error": "text too long"}), 400
        conn.execute(
            "UPDATE tasks SET date=?, status=?, text=? WHERE id=?",
            (date, status, text, task_id))
        conn.commit()
        return jsonify({"success": True})
    conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    conn.commit()
    return jsonify({"success": True})

@app.route("/api/task_dates")
@limiter.limit("120 per minute")
def task_dates():
    return jsonify([r["date"] for r in get_db().execute("SELECT DISTINCT date FROM tasks ORDER BY date").fetchall()])

# ============================================================
#  LABS
# ============================================================

@app.route("/api/labs", methods=["GET", "POST"])
@limiter.limit("120 per minute")
def manage_labs():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True)
        items = data if isinstance(data, list) else [data]
        for item in items:
            group, subject = item.get('group'), item.get('subject')
            if not group or not subject:
                continue
            comp, tot = max(0, int(item.get('completed', 0))), max(0, int(item.get('total', 0)))
            if comp > tot:
                comp = tot
            conn.execute(
                "INSERT OR REPLACE INTO lab_progress (group_name, subject, completed, total) VALUES (?, ?, ?, ?)",
                (group, subject, comp, tot))
        conn.commit()
        return jsonify({"success": True})
    group = request.args.get('group')
    if not group:
        return jsonify({})
    return jsonify({
        r["subject"]: {"completed": r["completed"], "total": r["total"]}
        for r in conn.execute("SELECT subject, completed, total FROM lab_progress WHERE group_name=?", (group,)).fetchall()
    })

def _recalc_lab_progress(conn, group, subject):
    row = conn.execute(
        "SELECT COUNT(*) AS total, COALESCE(SUM(completed), 0) AS done FROM lab_items WHERE group_name=? AND subject=?",
        (group, subject)).fetchone()
    total, done = row["total"] or 0, row["done"] or 0
    if total == 0:
        conn.execute("DELETE FROM lab_progress WHERE group_name=? AND subject=?", (group, subject))
    else:
        conn.execute(
            "INSERT OR REPLACE INTO lab_progress (group_name, subject, completed, total) VALUES (?, ?, ?, ?)",
            (group, subject, done, total))

@app.route("/api/lab_items", methods=["GET"])
@limiter.limit("240 per minute")
def get_lab_items():
    group = (request.args.get('group') or '').strip()
    if not group:
        return jsonify({})
    grouped = {}
    for r in get_db().execute(
            "SELECT id, subject, idx, title, completed FROM lab_items WHERE group_name=? ORDER BY subject, idx",
            (group,)).fetchall():
        if r["subject"] not in grouped:
            grouped[r["subject"]] = []
        grouped[r["subject"]].append({
            "id": r["id"],
            "idx": r["idx"],
            "title": r["title"],
            "completed": int(r["completed"])
        })
    return jsonify(grouped)

@app.route("/api/lab_items/sync", methods=["POST"])
@limiter.limit("120 per minute")
def sync_lab_items():
    data = request.get_json(silent=True) or {}
    group, items = data.get('group'), data.get('items')
    if not group or not isinstance(items, list):
        return jsonify({"error": "required"}), 400
    conn = get_db()
    touched = set()
    for spec in items:
        subject, count = spec.get('subject'), int(spec.get('count') or 0)
        if not subject or count <= 0 or count > 200:
            continue
        touched.add(subject)
        existing = {r["idx"] for r in conn.execute(
            "SELECT idx FROM lab_items WHERE group_name=? AND subject=?",
            (group, subject)).fetchall()}
        short = subject[subject.rfind('(')+1:subject.rfind(')')].strip() if '(' in subject else subject
        for i in range(1, count + 1):
            if i not in existing:
                conn.execute(
                    "INSERT OR IGNORE INTO lab_items (group_name, subject, idx, title, completed) VALUES (?, ?, ?, ?, 0)",
                    (group, subject, i, f"{short}{i}"))
    for subj in touched:
        _recalc_lab_progress(conn, group, subj)
    conn.commit()
    return jsonify({"success": True})

@app.route("/api/lab_items/add", methods=["POST"])
@limiter.limit("120 per minute")
def add_lab_item():
    data = request.get_json(silent=True) or {}
    group, subject = data.get('group'), data.get('subject')
    if not group or not subject:
        return jsonify({"error": "required"}), 400
    conn = get_db()
    next_idx = (conn.execute(
        "SELECT COALESCE(MAX(idx), 0) FROM lab_items WHERE group_name=? AND subject=?",
        (group, subject)).fetchone()[0]) + 1
    short = subject[subject.rfind('(')+1:subject.rfind(')')].strip() if '(' in subject else subject
    conn.execute(
        "INSERT INTO lab_items (group_name, subject, idx, title, completed) VALUES (?, ?, ?, ?, 0)",
        (group, subject, next_idx, f"{short}{next_idx}"))
    _recalc_lab_progress(conn, group, subject)
    conn.commit()
    return jsonify({"success": True})

@app.route("/api/lab_items/remove_last", methods=["POST"])
@limiter.limit("120 per minute")
def remove_last_lab_item():
    data = request.get_json(silent=True) or {}
    group, subject = data.get('group'), data.get('subject')
    row = get_db().execute(
        "SELECT id FROM lab_items WHERE group_name=? AND subject=? ORDER BY idx DESC LIMIT 1",
        (group, subject)).fetchone()
    if not row:
        return jsonify({"success": False}), 404
    conn = get_db()
    conn.execute("DELETE FROM lab_items WHERE id=?", (row["id"],))
    _recalc_lab_progress(conn, group, subject)
    conn.commit()
    return jsonify({"success": True})

@app.route("/api/lab_items/<int:item_id>", methods=["PUT", "DELETE"])
@limiter.limit("240 per minute")
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
    row = conn.execute(
        "SELECT group_name, subject, title, completed FROM lab_items WHERE id=?",
        (item_id,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404
    new_title = str(data.get('title', row["title"])).strip()[:200] or row["title"]
    new_comp = 1 if int(data.get('completed', row["completed"])) else 0
    conn.execute("UPDATE lab_items SET title=?, completed=? WHERE id=?", (new_title, new_comp, item_id))
    _recalc_lab_progress(conn, row["group_name"], row["subject"])
    conn.commit()
    return jsonify({"success": True, "title": new_title, "completed": new_comp})

# ============================================================
#  SCHEDULE
# ============================================================

@app.route("/api/schedule_all")
@limiter.limit("60 per minute")
def get_schedule_all():
    raw_group = request.args.get('group')
    try:
        group = validate_group(raw_group)
    except ValueError:
        return jsonify([])
    subgroup = validate_subgroup(request.args.get('subgroup', '0'))
    try:
        cache_file = os.path.join(SCHEDULES_DIR, f"{make_safe_filename(group)}_{subgroup}.json")
        if os.path.exists(cache_file):
            with open(cache_file, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        schedule = planner.get_semester_schedule(group, subgroup)
        return jsonify(schedule)
    except Exception as e:
        _safe_print(f"Error fetching schedule: {e}")
        return jsonify([])

@app.route("/api/schedule_sync")
@limiter.limit("10 per minute")
def sync_schedule():
    raw_group = request.args.get('group')
    try:
        group = validate_group(raw_group)
    except ValueError:
        return jsonify([])
    subgroup = validate_subgroup(request.args.get('subgroup', '0'))

    force = request.args.get('force') == '1'
    sync_key = f"{group}_{subgroup}"

    # Если force не задан и синкали недавно — не дёргаем СевГУ.
    if not force and not _needs_sync(sync_key):
        return jsonify([])

    try:
        schedule = planner.get_semester_schedule(group, subgroup)
        cache_file = os.path.join(SCHEDULES_DIR, f"{make_safe_filename(group)}_{subgroup}.json")

        if schedule:
            # Защита от затирания: если СевГУ вернул огрызок — отдаём старый кэш.
            if os.path.exists(cache_file):
                try:
                    with open(cache_file, 'r', encoding='utf-8') as f:
                        old_schedule = json.load(f)
                    if len(schedule) < len(old_schedule) * 0.9:
                        _safe_print(
                            f"[sync] защита: получено {len(schedule)} пар, в кэше {len(old_schedule)} — оставляю кэш",
                            flush=True)
                        return jsonify(old_schedule)
                except (json.JSONDecodeError, OSError):
                    pass

            try:
                tmp = cache_file + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    json.dump(schedule, f, ensure_ascii=False)
                os.replace(tmp, cache_file)
            except OSError:
                pass

            _mark_synced(sync_key)
        else:
            # Пустой ответ — не считаем «свежим». Помечаем только если кэша нет,
            # чтобы не дёргать СевГУ по кругу на группе без пар.
            if not os.path.exists(cache_file):
                _mark_synced(sync_key)

        return jsonify(schedule)
    except Exception as e:
        _safe_print(f"Error syncing schedule: {e}", flush=True)
        return jsonify([])

@app.route("/api/schedule.ics")
@limiter.limit("30 per minute")
def export_ics():
    raw_group = request.args.get('group')
    try:
        group = validate_group(raw_group)
    except ValueError:
        return jsonify({"error": "invalid group"}), 400
    subgroup = validate_subgroup(request.args.get('subgroup', '0'))
    cache_file = os.path.join(SCHEDULES_DIR, f"{make_safe_filename(group)}_{subgroup}.json")
    if not os.path.exists(cache_file):
        return Response(
            "Расписание ещё не загружено. Откройте группу в календаре, затем скачивайте .ics.",
            status=409, mimetype='text/plain; charset=utf-8')
    try:
        with open(cache_file, 'r', encoding='utf-8') as f:
            schedule = json.load(f)
    except (OSError, json.JSONDecodeError):
        return Response("Ошибка чтения кэша", status=500, mimetype='text/plain; charset=utf-8')

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//EzhMobile//EzhDiary//RU",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    for item in schedule:
        date_str = item.get('date', '')
        time_range = item.get('time_range', '')
        lesson = item.get('lesson', '')
        type_name = item.get('type_name', '')
        teacher = item.get('teacher', '')
        location = item.get('location', '')
        if not date_str or ' - ' not in time_range:
            continue
        try:
            start_time, end_time = [t.strip() for t in time_range.split(' - ')]
            dt_start = datetime.strptime(f"{date_str} {start_time}", "%Y-%m-%d %H:%M")
            dt_end = datetime.strptime(f"{date_str} {end_time}", "%Y-%m-%d %H:%M")
        except ValueError:
            continue
        uid = hashlib.md5(f"{group}_{date_str}_{item.get('n','')}_{lesson}".encode()).hexdigest()[:16]
        summary = lesson
        if type_name:
            summary += f" ({type_name})"
        desc_parts = []
        if teacher:
            desc_parts.append(f"Преподаватель: {teacher}")
        if location:
            desc_parts.append(f"Аудитория: {location}")
        desc = "\\n".join(desc_parts)
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{uid}@ezh.local",
            f"DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}",
            f"DTSTART:{dt_start.strftime('%Y%m%dT%H%M%S')}",
            f"DTEND:{dt_end.strftime('%Y%m%dT%H%M%S')}",
            f"SUMMARY:{summary}",
            f"DESCRIPTION:{desc}",
            f"LOCATION:{location}",
            "END:VEVENT",
        ])
    lines.append("END:VCALENDAR")

    from urllib.parse import quote
    filename = f"schedule_{group}_{subgroup}.ics"
    return Response(
        "\r\n".join(lines),
        mimetype='text/calendar; charset=utf-8',
        headers={'Content-Disposition': f"attachment; filename*=UTF-8''{quote(filename)}"}
    )

# ============================================================
#  SEARCH
# ============================================================

@app.route("/api/search")
@limiter.limit("240 per minute")
def search():
    q = (request.args.get('q') or '').strip()
    if len(q) < 2:
        return jsonify({"tasks": [], "events": [], "count": 0})
    if len(q) > 100:
        q = q[:100]
    conn = get_db()
    like = f"%{q}%"
    tasks = [dict(r) for r in conn.execute(
        "SELECT id, date, text, status FROM tasks WHERE text LIKE ? ORDER BY date DESC LIMIT 50",
        (like,)).fetchall()]
    events = [dict(r) for r in conn.execute(
        "SELECT id, base_date, time_range, lesson, type_name, teacher, location, is_event, recurrence "
        "FROM custom_schedule WHERE lesson LIKE ? ORDER BY base_date DESC LIMIT 50",
        (like,)).fetchall()]
    return jsonify({"tasks": tasks, "events": events, "count": len(tasks) + len(events)})

# ============================================================
#  FRIENDS
# ============================================================

@app.route("/api/friends", methods=["GET", "POST"])
@limiter.limit("120 per minute")
def manage_friends():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        group_raw = (data.get('group') or '').strip()
        subgroup = str(data.get('subgroup', '0'))
        category = (data.get('category') or '').strip()

        if not name or not group_raw:
            return jsonify({"error": "name and group required"}), 400
        if len(name) > 100 or len(category) > 100:
            return jsonify({"error": "field too long"}), 400
        try:
            group = validate_group(group_raw)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        cursor = conn.execute(
            "INSERT INTO friends (name, group_name, subgroup, category) VALUES (?, ?, ?, ?)",
            (name, group, subgroup, category))
        conn.commit()
        return jsonify({"id": cursor.lastrowid})
    return jsonify([{
        "id": r["id"], "name": r["name"], "group": r["group_name"],
        "subgroup": r["subgroup"], "category": r["category"] or ""
    } for r in conn.execute("SELECT * FROM friends").fetchall()])

@app.route("/api/friends/<int:friend_id>", methods=["PUT", "DELETE"])
@limiter.limit("120 per minute")
def update_or_delete_friend(friend_id):
    conn = get_db()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        group_raw = (data.get('group') or '').strip()
        subgroup = str(data.get('subgroup', '0'))
        category = (data.get('category') or '').strip()
        if not name or not group_raw:
            return jsonify({"error": "name and group required"}), 400
        try:
            group = validate_group(group_raw)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        conn.execute(
            "UPDATE friends SET name=?, group_name=?, subgroup=?, category=? WHERE id=?",
            (name, group, subgroup, category, friend_id))
        conn.commit()
        return jsonify({"success": True})
    conn.execute("DELETE FROM friends WHERE id=?", (friend_id,))
    conn.commit()
    return jsonify({"success": True})

# ============================================================
#  SUBJECTS
# ============================================================

@app.route("/api/subjects", methods=["GET", "POST"])
@limiter.limit("120 per minute")
def manage_subjects():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        subject = (data.get('subject') or '').strip()
        if not subject:
            return jsonify({"error": "subject required"}), 400
        if len(subject) > 200:
            return jsonify({"error": "subject too long"}), 400
        link = (data.get('link', '') or '').strip()
        if link and not (link.startswith('http://') or link.startswith('https://') or link.startswith('mailto:')):
            link = ''
        conn.execute(
            "INSERT OR REPLACE INTO subject_settings (subject, custom_name, link, teacher, location) VALUES (?, ?, ?, ?, ?)",
            (subject, data.get('custom_name', '') or '', link,
             data.get('teacher', '') or '', data.get('location', '') or ''))
        conn.commit()
        return jsonify({"success": True})
    resp = jsonify({
        r["subject"]: {
            "custom_name": r["custom_name"], "link": r["link"],
            "teacher": r["teacher"], "location": r["location"]
        } for r in conn.execute("SELECT * FROM subject_settings").fetchall()
    })
    resp.headers['Cache-Control'] = 'private, max-age=300'
    return resp

# ============================================================
#  CUSTOM SCHEDULE
# ============================================================

@app.route("/api/custom_schedule", methods=["GET", "POST"])
@limiter.limit("120 per minute")
def manage_custom_schedule():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        group_raw = (data.get('group') or '').strip()
        lesson = (data.get('lesson') or '').strip()
        if not group_raw or not lesson:
            return jsonify({"error": "required"}), 400
        if len(lesson) > 200:
            return jsonify({"error": "lesson too long"}), 400
        try:
            group = validate_group(group_raw)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        cursor = conn.execute(
            "INSERT INTO custom_schedule (group_name, base_date, time_range, lesson, type_name, teacher, location, is_event, recurrence, exceptions) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (group, data.get('base_date', ''), data.get('time_range', ''),
             lesson, data.get('type_name', ''), data.get('teacher', ''),
             data.get('location', ''), int(data.get('is_event', 0)),
             data.get('recurrence', 'none'), data.get('exceptions', '[]')))
        conn.commit()
        return jsonify({"id": cursor.lastrowid})
    group = request.args.get('group')
    if not group:
        return jsonify([])
    return jsonify([{
        "id": r["id"], "base_date": r["base_date"], "time_range": r["time_range"],
        "lesson": r["lesson"], "type_name": r["type_name"], "teacher": r["teacher"],
        "location": r["location"], "is_event": r["is_event"], "recurrence": r["recurrence"],
        "exceptions": r["exceptions"] or "[]"
    } for r in conn.execute("SELECT * FROM custom_schedule WHERE group_name=?", (group,)).fetchall()])

@app.route("/api/custom_schedule/<int:item_id>", methods=["PUT", "DELETE"])
@limiter.limit("120 per minute")
def update_custom_schedule(item_id):
    conn = get_db()
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        lesson = (data.get('lesson') or '').strip()
        if not lesson:
            return jsonify({"error": "lesson required"}), 400
        if len(lesson) > 200:
            return jsonify({"error": "lesson too long"}), 400
        conn.execute(
            "UPDATE custom_schedule SET base_date=?, time_range=?, lesson=?, type_name=?, teacher=?, location=?, is_event=?, recurrence=?, exceptions=? WHERE id=?",
            (data.get('base_date', ''), data.get('time_range', ''), lesson,
             data.get('type_name', ''), data.get('teacher', ''),
             data.get('location', ''), int(data.get('is_event', 0)),
             data.get('recurrence', 'none'), data.get('exceptions', '[]'), item_id))
        conn.commit()
        return jsonify({"success": True})
    conn.execute("DELETE FROM custom_schedule WHERE id=?", (item_id,))
    conn.commit()
    return jsonify({"success": True})

# ============================================================
#  TEACHERS
# ============================================================

@app.route("/api/teachers")
@limiter.limit("60 per minute")
def get_teachers():
    try:
        items = teacher_planner.get_teachers(force=request.args.get('force') == '1')
    except Exception:
        items = []
    resp = jsonify(items)
    resp.headers['Cache-Control'] = 'public, max-age=3600'
    return resp

@app.route("/api/teacher_schedule")
@limiter.limit("60 per minute")
def get_teacher_schedule():
    slug = (request.args.get('slug') or '').strip()
    if not slug:
        return jsonify([])
    try:
        return jsonify(teacher_planner.get_teacher_schedule(slug, force=request.args.get('force') == '1'))
    except Exception:
        return jsonify([])

@app.route("/api/tracked_teachers", methods=["GET", "POST"])
@limiter.limit("120 per minute")
def manage_tracked_teachers():
    conn = get_db()
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        slug = (data.get('slug') or '').strip().lower()
        if not name or not slug:
            return jsonify({"error": "invalid data"}), 400
        if len(name) > 200 or len(slug) > 100:
            return jsonify({"error": "field too long"}), 400
        cursor = conn.execute("INSERT OR IGNORE INTO tracked_teachers (name, slug) VALUES (?, ?)", (name, slug))
        conn.commit()
        if cursor.lastrowid:
            return jsonify({"id": cursor.lastrowid, "name": name, "slug": slug})
        row = conn.execute("SELECT id FROM tracked_teachers WHERE slug=?", (slug,)).fetchone()
        return jsonify({"id": row["id"], "name": name, "slug": slug, "already": True})
    return jsonify([{"id": r["id"], "name": r["name"], "slug": r["slug"]}
                    for r in conn.execute("SELECT id, name, slug FROM tracked_teachers ORDER BY id").fetchall()])

@app.route("/api/tracked_teachers/<int:item_id>", methods=["DELETE"])
@limiter.limit("120 per minute")
def delete_tracked_teacher(item_id):
    conn = get_db()
    conn.execute("DELETE FROM tracked_teachers WHERE id=?", (item_id,))
    conn.commit()
    return jsonify({"success": True})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
