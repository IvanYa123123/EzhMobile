import os
import re
import json
import time
import threading
import requests
import urllib3
import certifi

from teacher_parser import parse_teachers_list, parse_ics_schedule, is_person_name

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

TEACHERS_LIST_TTL = 24 * 3600
TEACHER_SCHEDULE_TTL = 6 * 3600
BACKGROUND_REFRESH_INTERVAL = 6 * 3600
BACKGROUND_REFRESH_STARTUP_DELAY = 600
BACKGROUND_REFRESH_BATCH = 30
SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9\-]{0,80}[a-z0-9]$')

class SevSUTeacherPlanner:
    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        self.teachers_json = os.path.join(base_dir, 'teachers.json')
        self.schedules_dir = os.path.join(base_dir, 'teacher_schedules')
        os.makedirs(self.schedules_dir, exist_ok=True)

        self.teachers_url = 'https://schedule.sevsu.ru/teachers'
        self.calendar_url = 'https://schedule.sevsu.ru/calendar/teacher/{slug}'

        self.headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            )
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)

        self.session.trust_env = False
        self.session.verify = certifi.where()

        try:
            from requests.adapters import HTTPAdapter
            from urllib3.util.retry import Retry
            retry = Retry(
                total=3,
                backoff_factor=0.5,
                status_forcelist=(429, 500, 502, 503, 504),
                allowed_methods=frozenset(['GET']),
            )
            adapter = HTTPAdapter(
                max_retries=retry,
                pool_connections=8,
                pool_maxsize=8,
                pool_block=False,
            )
            self.session.mount('https://', adapter)
            self.session.mount('http://', adapter)
        except ImportError:
            pass

        self._lock = threading.RLock()
        self._bg_started = False
        self._bg_teachers_started = False

    def get_teachers(self, force: bool = False) -> list:
        with self._lock:
            cached = self._read_teachers_cache()
            if cached and not force:
                age = time.time() - cached.get('updated_at', 0)
                if age < TEACHERS_LIST_TTL:
                    return self._clean_teachers(cached.get('items', []))
            cached_items = self._clean_teachers(cached.get('items', [])) if cached else []

        # Без сети не держим запрос: отдаём teachers.json сразу, а обновление
        # с сайта уходит в фоновый поток.
        if cached_items and not force:
            self._start_teachers_refresh()
            return cached_items

        items = self._clean_teachers(self._fetch_teachers_from_site())
        if items:
            with self._lock:
                self._write_teachers_cache(items)
            return items
        return cached_items

    def _start_teachers_refresh(self):
        with self._lock:
            if self._bg_teachers_started:
                return
            self._bg_teachers_started = True

        def _run():
            try:
                items = self._clean_teachers(self._fetch_teachers_from_site())
                if items:
                    with self._lock:
                        self._write_teachers_cache(items)
            except Exception as e:
                print(f'[teachers] background refresh failed: {e}', flush=True)
            finally:
                with self._lock:
                    self._bg_teachers_started = False

        threading.Thread(target=_run, daemon=True).start()

    def _fetch_teachers_from_site(self) -> list:
        try:
            r = self.session.get(self.teachers_url, timeout=(5, 15))
            if r.status_code != 200:
                print(f'[teachers] HTTP {r.status_code}', flush=True)
                return []
            r.encoding = 'utf-8'
            return parse_teachers_list(r.text)
        except Exception as e:
            print(f'[teachers] fetch failed: {e}', flush=True)
            return []

    def _clean_teachers(self, items: list) -> list:
        """Отбрасывает строки-не-люди («Вакансия УПП», «0 - ОМР») из кэша."""
        return [it for it in items
                if isinstance(it, dict) and it.get('slug') and is_person_name(it.get('name', ''))]

    def _read_teachers_cache(self):
        try:
            with open(self.teachers_json, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return None

    def _write_teachers_cache(self, items: list):
        items = self._clean_teachers(items)
        try:
            tmp = self.teachers_json + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(
                    {'updated_at': time.time(), 'items': items},
                    f, ensure_ascii=False, indent=2,
                )
                f.write('\n')
            os.replace(tmp, self.teachers_json)
        except OSError:
            pass

    def get_teacher_schedule(self, slug: str, force: bool = False) -> list:
        slug = self._validate_slug(slug)
        if not slug:
            return []

        ics_path = os.path.join(self.schedules_dir, f'{slug}.ics')
        meta_path = os.path.join(self.schedules_dir, f'{slug}.meta.json')

        if not force:
            cached = self._read_schedule_cache(ics_path, meta_path)
            if cached is not None and cached['age'] < TEACHER_SCHEDULE_TTL:
                return cached['schedule']

        fresh_ics = self._download_ics(slug)
        if fresh_ics:
            schedule = parse_ics_schedule(fresh_ics)
            if schedule:
                self._write_ics(ics_path, fresh_ics)
                self._write_meta(meta_path)
                return schedule
            else:
                print(f'[teacher_ics] {slug}: ICS пустой после парсинга', flush=True)

        cached = self._read_schedule_cache(ics_path, meta_path)
        if cached is not None:
            return cached['schedule']
        return []

    def _download_ics(self, slug: str) -> str:
        url = self.calendar_url.format(slug=slug)
        try:
            r = self.session.get(url, timeout=25)
            if r.status_code != 200:
                print(f'[teacher_ics] {slug} HTTP {r.status_code}', flush=True)
                return ''
            r.encoding = 'utf-8'
            text = r.text
            if 'BEGIN:VCALENDAR' not in text:
                print(f'[teacher_ics] {slug}: ответ не ICS', flush=True)
                return ''
            return text
        except Exception as e:
            print(f'[teacher_ics] {slug} error: {e}', flush=True)
            return ''

    def _read_schedule_cache(self, ics_path: str, meta_path: str):
        try:
            with open(ics_path, 'r', encoding='utf-8') as f:
                ics = f.read()
        except OSError:
            return None

        schedule = parse_ics_schedule(ics)
        if not schedule:
            return None

        # Без .meta.json кэш считается устаревшим; updated_at может быть
        # не числом — коэрцируем к float и ловим TypeError отдельно.
        age = float('inf')
        try:
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            raw_ts = meta.get('updated_at', 0)
            try:
                ts = float(raw_ts)
            except (TypeError, ValueError):
                ts = 0.0
            age = time.time() - ts
        except (OSError, json.JSONDecodeError):
            pass
        except TypeError:
            # meta не dict (например, list/scalar) — тоже считаем «старым».
            pass

        return {'schedule': schedule, 'age': age}

    def _write_ics(self, path: str, ics_text: str):
        try:
            tmp = path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                f.write(ics_text)
            os.replace(tmp, path)
        except OSError:
            pass

    def _write_meta(self, path: str):
        try:
            tmp = path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump({'updated_at': time.time()}, f)
            os.replace(tmp, path)
        except OSError:
            pass

    @staticmethod
    def _validate_slug(slug: str) -> str:
        if not slug:
            return ''
        s = str(slug).strip().lower()
        if not SLUG_RE.match(s):
            return ''
        return s

    def start_background_refresh(self, interval_hours: int = 6):
        with self._lock:
            if self._bg_started:
                return
            self._bg_started = True

        def _loop():
            time.sleep(BACKGROUND_REFRESH_STARTUP_DELAY)
            while True:
                try:
                    self._refresh_stale_batch()
                except Exception as e:
                    print(f'[teacher_bg] error: {e}', flush=True)
                time.sleep(interval_hours * 3600)

        t = threading.Thread(target=_loop, daemon=True, name='teacher_bg_refresh')
        t.start()

    def _refresh_stale_batch(self):
        try:
            files = [f for f in os.listdir(self.schedules_dir) if f.endswith('.ics')]
        except OSError:
            return
        if not files:
            return

        now = time.time()
        stale = []
        for fname in files:
            slug = fname[:-4]
            meta_path = os.path.join(self.schedules_dir, f'{slug}.meta.json')
            try:
                with open(meta_path, 'r', encoding='utf-8') as f:
                    meta = json.load(f)
                raw_ts = meta.get('updated_at', 0)
                try:
                    ts = float(raw_ts)
                except (TypeError, ValueError):
                    ts = 0.0
                if now - ts > TEACHER_SCHEDULE_TTL:
                    stale.append(slug)
            except (OSError, json.JSONDecodeError, TypeError):
                stale.append(slug)

        if not stale:
            return

        stale = stale[:BACKGROUND_REFRESH_BATCH]
        for slug in stale:
            try:
                self.get_teacher_schedule(slug, force=True)
            except Exception:
                pass
            time.sleep(1.5)
