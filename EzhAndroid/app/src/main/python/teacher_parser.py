"""
Парсеры для расписания преподавателей СевГУ.

Два формата:
  • HTML со страницы /teachers — список преподавателей
  • ICS со страницы /calendar/teacher/<slug> — расписание преподавателя

Если BeautifulSoup доступен — используем его. Если нет — резервный
regex-парсер. Это защищает от ситуации, когда зависимость забыли
установить или PyInstaller её не подхватил.
"""
import re
from html import unescape
from datetime import datetime

try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False

# ==================================================================
#  СПИСОК ПРЕПОДАВАТЕЛЕЙ (/teachers)
# ==================================================================

_SLUG_RE = re.compile(r'^/teachers/([a-z0-9][a-z0-9\-]*[a-z0-9])/?$')
_WS_RE = re.compile(r'\s+')

def parse_teachers_list(html: str) -> list:
    """Парсит HTML страницы /teachers.

    Возвращает список словарей:
      [{'name': 'Абаев Евгений Александрович',
        'slug': 'abaev-evgenij-aleksandrovich'}, ...]

    Преподаватели без опубликованного расписания в список НЕ попадают —
    на странице /teachers у них просто нет ссылки на /teachers/<slug>.
    """
    if not html:
        return []

    if _HAS_BS4:
        return _parse_teachers_bs4(html)
    return _parse_teachers_regex(html)

def _parse_teachers_bs4(html: str) -> list:
    try:
        soup = BeautifulSoup(html, 'lxml')
    except Exception:
        soup = BeautifulSoup(html, 'html.parser')

    result = []
    seen = set()

    for a in soup.find_all('a', href=True):
        href = a['href']
        m = _SLUG_RE.match(href)
        if not m:
            continue
        slug = m.group(1)
        if slug in seen:
            continue

        # Идём вверх вручную до ближайшего li/div/tr/article, но не глубже
        # 5 уровней. Раньше здесь был a.find_parent([...], limit=5) —
        # в bs4 4.12 параметр limit уходит в find_parents и означает
        # «максимум результатов», а не «глубину». Поведение на разных
        # версиях bs4 разное, поэтому переписали явно.
        name = ''
        parent = None
        cur = a.parent
        for _ in range(5):
            if cur is None:
                break
            if cur.name in ('li', 'div', 'tr', 'article'):
                parent = cur
                break
            cur = cur.parent

        if parent is not None:
            for tag in parent.find_all(['span', 'div', 'td', 'h3', 'h4', 'p'], limit=8):
                if tag.find('a', href=True):
                    continue
                txt = tag.get_text(' ', strip=True)
                if txt and len(txt) > 4 and not _looks_like_button_text(txt):
                    name = txt
                    break
            if not name:
                text_parts = []
                for child in parent.descendants:
                    if getattr(child, 'name', None) == 'a':
                        continue
                    if isinstance(child, str):
                        text_parts.append(child)
                name = ' '.join(''.join(text_parts).split())

        name = _WS_RE.sub(' ', name).strip()
        if not name or len(name) < 3:
            continue
        if _looks_like_button_text(name):
            continue

        seen.add(slug)
        result.append({'name': name, 'slug': slug})

    return result

def _looks_like_button_text(text: str) -> bool:
    low = text.lower().strip(' :.-—')
    return low in ('открыть расписание', 'открыть', 'расписание', 'показать')

def _parse_teachers_regex(html: str) -> list:
    """Резервный парсер без bs4 — по регуляркам."""
    result = []
    seen = set()

    for m in re.finditer(r'href="(/teachers/([a-z0-9][a-z0-9\-]*[a-z0-9]))"', html):
        slug = m.group(2)
        if slug in seen:
            continue

        start = max(0, m.start() - 400)
        ctx = html[start:m.start()]
        text_blocks = re.findall(r'>([^<>]{5,120})<', ctx)
        name = ''
        for tb in reversed(text_blocks):
            cleaned = unescape(tb).strip()
            if cleaned and not _looks_like_button_text(cleaned):
                name = cleaned
                break

        name = _WS_RE.sub(' ', name).strip()
        if name and len(name) >= 3:
            seen.add(slug)
            result.append({'name': name, 'slug': slug})

    return result

# ==================================================================
#  РАСПИСАНИЕ ПРЕПОДАВАТЕЛЯ (ICS)
# ==================================================================

def parse_ics_schedule(ics_text: str) -> list:
    if not ics_text or 'BEGIN:VCALENDAR' not in ics_text:
        return []

    events = _split_events(ics_text)
    result = []
    for ev in events:
        parsed = _parse_event(ev)
        if parsed:
            result.append(parsed)

    result.sort(key=lambda x: (x['date'], x['n']))
    return result

def _split_events(ics_text: str) -> list:
    text = ics_text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'\n[ \t]', '', text)
    return re.findall(r'BEGIN:VEVENT(.*?)END:VEVENT', text, re.DOTALL)

def _unfold_field(value: str) -> str:
    return (value
            .replace('\\n', '\n')
            .replace('\\N', '\n')
            .replace('\\,', ',')
            .replace('\\;', ';')
            .replace('\\\\', '\\'))

def _get_field(event_block: str, name: str) -> str:
    m = re.search(rf'^{name}(?:;[^:\n]+)?:(.*)$', event_block, re.MULTILINE)
    if not m:
        return ''
    return _unfold_field(m.group(1).strip())

def _parse_ics_datetime(s: str):
    s = (s or '').strip()
    if not s:
        return None

    m = re.match(r'^(\d{8})T(\d{6})(Z?)$', s)
    if m:
        try:
            return datetime.strptime(m.group(1) + m.group(2), '%Y%m%d%H%M%S')
        except ValueError:
            return None

    m = re.match(r'^(\d{8})$', s)
    if m:
        try:
            return datetime.strptime(m.group(1), '%Y%m%d')
        except ValueError:
            return None

    return None

_TIME_TO_PAIR = {
    (8, 30): 1,
    (10, 10): 2,
    (11, 50): 3,
    (13, 50): 3,
    (14, 0): 4,
    (15, 20): 4,
    (15, 40): 5,
    (17, 20): 6,
    (19, 0): 7,
    (20, 40): 8,
}

def _pair_number(h: int, m: int) -> int:
    return _TIME_TO_PAIR.get((h, m), 0)

_TYPE_PATTERNS = [
    (re.compile(r'\bлек(?:ция|\.)?\b', re.I), 'Лекция'),
    (re.compile(r'\bпз\b|\bпрак', re.I), 'ПЗ'),
    (re.compile(r'\bлз\b|\bлаб', re.I), 'ЛЗ'),
    (re.compile(r'\bзач', re.I), 'Зачёт'),
    (re.compile(r'\bэкз', re.I), 'Экзамен'),
    (re.compile(r'\bсем', re.I), 'Семинар'),
]

def _parse_event(block: str):
    dtstart = _get_field(block, 'DTSTART')
    dtend = _get_field(block, 'DTEND')
    if not dtstart or not dtend:
        return None

    start_dt = _parse_ics_datetime(dtstart)
    end_dt = _parse_ics_datetime(dtend)
    if not start_dt or not end_dt:
        return None

    summary = _get_field(block, 'SUMMARY')
    location = _get_field(block, 'LOCATION')
    description = _get_field(block, 'DESCRIPTION')

    lesson, type_name, groups = _parse_summary(summary, description)

    return {
        'date': start_dt.strftime('%Y-%m-%d'),
        'n': _pair_number(start_dt.hour, start_dt.minute),
        'time_range': f'{start_dt.strftime("%H:%M")} - {end_dt.strftime("%H:%M")}',
        'lesson': lesson or summary,
        'type_name': type_name,
        'location': location or '',
        'groups': groups,
    }

def _parse_summary(summary: str, description: str):
    summary = (summary or '').strip()
    description = (description or '').strip()

    lesson = summary
    type_name = ''

    m = re.search(r'^(.*?)\s*\(([^()]+)\)\s*$', summary)
    if m:
        inner = m.group(2).strip()
        is_type = any(p.search(inner) for p, _ in _TYPE_PATTERNS)
        short_type = inner.lower().strip() in (
            'лекция', 'лз', 'пз', 'семинар', 'зачёт', 'экзамен',
            'лек.', 'лаб.', 'практ.'
        )
        if is_type or short_type:
            lesson = m.group(1).strip()
            type_name = inner.split(',')[0].strip()

    if not type_name:
        m = re.search(r'^(.*?),\s*([^,]+)$', summary)
        if m:
            candidate = m.group(2).strip()
            if any(p.search(candidate) for p, _ in _TYPE_PATTERNS):
                lesson = m.group(1).strip()
                type_name = candidate

    if not type_name:
        m = re.match(r'^(Лекция|ПЗ|ЛЗ|Семинар|Зачёт|Экзамен)\.?\s*[:\-—]?\s*(.+)$',
                     summary, re.I)
        if m:
            type_name = m.group(1).strip()
            lesson = m.group(2).strip()

    if not type_name:
        for pattern, label in _TYPE_PATTERNS:
            if pattern.search(summary):
                type_name = label
                lesson = pattern.sub('', lesson).strip(' ,.;-—')
                break

    groups = _extract_groups(description, summary)
    return lesson, type_name, groups

_GROUP_IN_DESC_RE = re.compile(
    r'(?:групп[аы]?|groups?)\s*[:\-—]?\s*([^\n]+)',
    re.I
)
_GROUP_NAME_RE = re.compile(r'[А-Яа-яЁёA-Za-z]{2,5}/[а-яa-z]?-?\d{2}-\d-о[\w\-]*')

def _extract_groups(description: str, summary: str) -> list:
    text = (description or '') + '\n' + (summary or '')

    m = _GROUP_IN_DESC_RE.search(text)
    if m:
        raw = m.group(1).strip()
        parts = re.split(r'[,;]', raw)
        return [p.strip() for p in parts if p.strip()]

    found = _GROUP_NAME_RE.findall(text)
    seen = set()
    result = []
    for g in found:
        if g not in seen:
            seen.add(g)
            result.append(g)
    return result
