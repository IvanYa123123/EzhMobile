"""
Общие ресурсы Flask-приложения: пути, БД, кэши, лимитер, планировщики.

Модуль не содержит маршрутов — только то, что нужно app.py и blueprint'ам из
routes_*.py. Вынесено из app.py (п.4 архитектурной записки).
"""
import os, sys, json, time, re, sqlite3, threading, hashlib
from datetime import datetime, timezone, timedelta
from flask import Flask, request, g

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

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
STATIC_DIR = os.path.join(BUNDLE_DIR, "static")

MIN_SYNC_INTERVAL = 6 * 3600

APP_VERSION = "0.8"
try:
    with open(os.path.join(BASE_DIR, "VERSION"), "r", encoding="utf-8") as f:
        APP_VERSION = f.read().strip() or "0.8"
except OSError:
    pass

def _safe_print(*args, **kwargs):
    try:
        if sys.stdout is not None:
            print(*args, **kwargs)
    except Exception:
        pass

def _to_int(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default

def _s(v, default=''):
    if v is None:
        return default
    try:
        return str(v).strip()
    except Exception:
        return default

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='/static')

planner = SevSUPlanner()
teacher_planner = SevSUTeacherPlanner(BASE_DIR)
os.makedirs(SCHEDULES_DIR, exist_ok=True)

# Прогрев кэша расписаний преподавателей нужен и на Android: иначе кэш
# обновляется только по запросу пользователя (п.9 архитектурной записки).
try:
    teacher_planner.start_background_refresh(6)
except Exception:
    pass

limiter = Limiter(key_func=get_remote_address, app=app,
                  default_limits=["300 per minute"],
                  storage_uri="memory://", strategy="fixed-window")


@app.after_request
def _headers(response):
    if response.status_code == 200 and request.path.startswith('/static/'):
        # Сервер локальный, кэш ничего не экономит. immutable мешал обновлениям:
        # после установки нового APK WebView отдавал старый app.bundle.js по тому
        # же URL (?v=4). no-cache = всегда ревалидация, неизменённые файлы — 304.
        response.headers['Cache-Control'] = 'no-cache'
    elif not response.headers.get('Cache-Control'):
        response.headers['Cache-Control'] = 'no-store'

    csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
        "img-src 'self' data: blob:",
        "connect-src 'self' http://127.0.0.1:5000",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
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

_FORBIDDEN = str.maketrans({'/': '_', '\\': '_', ':': '_', '*': '_', '?': '_',
                            '"': '_', '<': '_', '>': '_', '|': '_'})
def make_safe_filename(name):
    return str(name).translate(_FORBIDDEN).replace('..', '__').strip('. ')[:120]

def _schedule_cache_path(group, subgroup):
    safe = make_safe_filename(group)
    digest = hashlib.md5(f"{group}\x00{subgroup}".encode('utf-8')).hexdigest()[:16]
    return os.path.join(SCHEDULES_DIR, f"{safe}_{subgroup}_{digest}.json")

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
    if not isinstance(data, dict):
        return True
    last = data.get(key, 0)
    try:
        last = float(last)
    except (TypeError, ValueError):
        last = 0.0
    return (time.time() - last) > MIN_SYNC_INTERVAL

def _mark_synced(key):
    cache = _sync_times_cache
    with cache.lock:
        data = cache.read(default_factory=dict)
        if not isinstance(data, dict):
            data = {}
        data[key] = time.time()
        cache.write(data)

_VALID_SUBGROUPS = frozenset(("0", "1", "2"))
_GROUP_RE = re.compile(r'^[A-Za-zА-Яа-яЁё0-9/._\-]{1,64}$')
_LINK_RE = re.compile(r'^(?:https?://|mailto:)[^\s"<>]{1,2000}$', re.IGNORECASE)
_TIME_RANGE_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d - ([01]\d|2[0-3]):[0-5]\d$')
_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')

def validate_subgroup(raw):
    s = _s(raw, "0")
    return s if s in _VALID_SUBGROUPS else "0"

def validate_group(raw):
    s = _s(raw)
    if not s:
        raise ValueError("group required")
    if len(s) > 64:
        raise ValueError("group too long")
    if not _GROUP_RE.match(s):
        raise ValueError("invalid group format")
    return s

def _validate_base_date(raw):
    s = _s(raw)
    if not _DATE_RE.match(s):
        return None
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return s
    except ValueError:
        return None

def _validate_time_range(raw):
    s = _s(raw)
    return s if _TIME_RANGE_RE.match(s) else None

def load_custom_groups():
    try:
        with open(CUSTOM_GROUPS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []

def save_custom_groups(groups):
    try:
        tmp = CUSTOM_GROUPS_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(groups, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, CUSTOM_GROUPS_FILE)
        return True
    except OSError:
        return False

_ICS_TASK_STATUS = {
    'green': 'Обычная', 'orange': 'Важная',
    'red': 'Срочная', 'completed': 'Выполнено',
}

def _ics_escape(s):
    if s is None:
        return ''
    return (str(s).replace('\\', '\\\\').replace(';', '\\;')
            .replace(',', '\\,').replace('\r', '').replace('\n', '\\n'))

def _fold_ics_line(line, limit=75):
    if not line:
        return line
    if len(line.encode('utf-8')) <= limit:
        return line
    parts, current, cur_limit = [], bytearray(), limit
    for ch in line:
        cb = ch.encode('utf-8')
        if len(current) + len(cb) > cur_limit:
            parts.append(current.decode('utf-8'))
            current = bytearray(b' ')
            cur_limit = limit - 1
        current += cb
    if current:
        parts.append(current.decode('utf-8'))
    return '\r\n'.join(parts)

def _generate_tasks_ics(tasks):
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0",
        "PRODID:-//Ezh Dnevnik//Tasks//RU",
        "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "X-WR-CALNAME:Заметки EZHednevnik",
    ]
    dtstamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    for t in tasks:
        date = str(t.get('date') or '')
        text = str(t.get('text') or '').strip()
        if not date or not text:
            continue
        try:
            day = datetime.strptime(date, '%Y-%m-%d')
        except ValueError:
            continue
        status = str(t.get('status') or 'green')
        uid = hashlib.md5(f"task|{date}|{text}".encode('utf-8')).hexdigest()[:16]
        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:{uid}@ezh-dnevnik")
        lines.append(f"DTSTAMP:{dtstamp}")
        lines.append(f"DTSTART;VALUE=DATE:{day.strftime('%Y%m%d')}")
        lines.append(f"DTEND;VALUE=DATE:{(day + timedelta(days=1)).strftime('%Y%m%d')}")
        lines.append(f"SUMMARY:{_ics_escape(text)}")
        lines.append(f"CATEGORIES:{_ics_escape(_ICS_TASK_STATUS.get(status, status))}")
        lines.append(f"X-EZHEDNEVNIK-STATUS:{_ics_escape(status)}")
        lines.append("STATUS:COMPLETED" if status == 'completed' else "STATUS:NEEDS-ACTION")
        lines.append("TRANSP:TRANSPARENT")
        if status == 'completed':
            lines.append("PERCENT-COMPLETE:100")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold_ics_line(l) for l in lines) + "\r\n"

def _save_schedule_cache(cache_file, schedule):
    if not schedule:
        return True
    old = None
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                old = json.load(f)
        except (json.JSONDecodeError, OSError):
            old = None
    if old and isinstance(old, list) and len(schedule) < len(old) * 0.9:
        old_max = max((str(x.get('date') or '') for x in old), default='')
        new_max = max((str(x.get('date') or '') for x in schedule), default='')
        if not (new_max and old_max and new_max < old_max):
            _safe_print(f"[schedule_cache] защита: получено {len(schedule)}, "
                        f"в кэше {len(old)} — оставляю кэш", flush=True)
            return False
    try:
        tmp = cache_file + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(schedule, f, ensure_ascii=False)
        os.replace(tmp, cache_file)
    except OSError:
        return False
    return True

