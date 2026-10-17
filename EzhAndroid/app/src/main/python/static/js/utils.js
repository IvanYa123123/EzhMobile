// Утилиты: экранирование, работа с датами/временем, склонения, определение корпуса.

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeJsString(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
}

function getLocalDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fixTime(str) {
    if (!str) return '';
    return str.replace('13:50', '14:00').replace('15:20', '15:30');
}

function applyTimeFix(scheduleArray) {
    if (!scheduleArray) return [];
    scheduleArray.forEach(item => {
        if (item.time_range) item.time_range = fixTime(item.time_range);
    });
    return scheduleArray;
}

function isScheduleDifferent(newSched, oldSched) {
    if (!newSched || !oldSched) return true;
    if (newSched.length !== oldSched.length) return true;
    const getHash = (arr) => arr.map(x => `${x.date}_${x.n}_${x.lesson}_${x.type_name}`).sort().join('|');
    return getHash(newSched) !== getHash(oldSched);
}

function getCampus(item) {
    if (!item) return 'unknown';
    let roman = null;

    if (item.location) {
        let loc = item.location.toUpperCase().trim();
        let m = loc.match(/^(VIII|VII|IX|VI|IV|V|III|II|I)(?=[^A-ZА-Яa-zа-я0-9]|$)/);
        if (m) roman = m[1];
    }

    if (!roman && item.lesson) {
        let txt = item.lesson.toUpperCase();
        let m2 = txt.match(/(?:АУД|КАБ|КОРП|КОРПУС|АУДИТОРИЯ)[.\s]*[:\-]?\s*(VIII|VII|IX|VI|IV|V|III|II|I)(?:[^A-ZА-Я0-9]|$)/);
        if (m2) roman = m2[1];
    }

    if (roman === 'VII' || roman === 'VIII' || roman === 'IX') return 'galosha';
    if (roman === 'V' || roman === 'VI') return 'gogol';
    if (roman === 'I' || roman === 'II' || roman === 'III' || roman === 'IV') return 'univer';
    return 'unknown';
}

function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    let lower = text.toLowerCase();
    let q = query.toLowerCase();
    let idx = lower.indexOf(q);
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) + '<b>' + escapeHtml(text.slice(idx, idx + q.length)) + '</b>' + escapeHtml(text.slice(idx + q.length));
}

function parseTimeRangeToMins(tr) {
    if (!tr) return [0, 0];
    let parts = tr.split('-');
    let s = parts[0].trim().split(':');
    let e = parts[1].trim().split(':');
    return [parseInt(s[0]||0)*60 + parseInt(s[1]||0), parseInt(e[0]||0)*60 + parseInt(e[1]||0)];
}

function isTimeOverlap(tr1, tr2) {
    let [s1, e1] = parseTimeRangeToMins(tr1);
    let [s2, e2] = parseTimeRangeToMins(tr2);
    return Math.max(s1, s2) < Math.min(e1, e2);
}

function getDisplaySubjectKey(subjKey) {
    if (cachedSubjectSettings && cachedSubjectSettings[subjKey] && cachedSubjectSettings[subjKey].custom_name) {
        return cachedSubjectSettings[subjKey].custom_name;
    }
    return subjKey;
}

function plural(n, one, few, many) {
    let mod10 = n % 10;
    let mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
}

function formatDuration(mins) {
    if (mins < 1) return "меньше минуты";
    if (mins < 60) return `${mins} ${plural(mins, 'минуту', 'минуты', 'минут')}`;
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    let hStr = `${h} ${plural(h, 'час', 'часа', 'часов')}`;
    if (m === 0) return hStr;
    return `${hStr} ${m} ${plural(m, 'минуту', 'минуты', 'минут')}`;
}

function formatDateRu(dateStr) {
    let [y, m, d] = dateStr.split('-').map(Number);
    let months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${d} ${months[m - 1]}`;
}

// ============================================================
//  ДЛИТЕЛЬНОСТЬ С ТОЧНОСТЬЮ (для статус-строки)
// ============================================================
function formatDurationMs(ms, precision = 'min') {
    if (!isFinite(ms) || ms < 0) return "0 секунд";

    const MS_SEC = 1000;
    const MS_MIN = 60 * MS_SEC;
    const MS_HOUR = 60 * MS_MIN;
    const MS_DAY = 24 * MS_HOUR;

    if (ms >= MS_DAY) {
        let days = Math.floor(ms / MS_DAY);
        let hours = Math.floor((ms % MS_DAY) / MS_HOUR);
        let dayStr = `${days} ${plural(days, 'день', 'дня', 'дней')}`;
        if (hours === 0) return dayStr;
        return `${dayStr} ${hours} ${plural(hours, 'час', 'часа', 'часов')}`;
    }

    let hours = Math.floor(ms / MS_HOUR);
    let mins  = Math.floor((ms % MS_HOUR) / MS_MIN);
    let secs  = Math.floor((ms % MS_MIN) / MS_SEC);
    let cs    = Math.floor((ms % MS_SEC) / 10);

    if (ms < MS_MIN) {
        if (precision === 'min') return "меньше минуты";
        if (precision === 'sec') return `${secs} ${plural(secs, 'секунду', 'секунды', 'секунд')}`;
        let csStr = String(cs).padStart(2, '0');
        return `${secs}.${csStr} ${plural(secs, 'секунды', 'секунд', 'секунд')}`;
    }

    let parts = [];

    if (hours > 0) {
        parts.push(`${hours} ${plural(hours, 'час', 'часа', 'часов')}`);
        parts.push(`${mins} ${plural(mins, 'минуту', 'минуты', 'минут')}`);
    } else {
        parts.push(`${mins} ${plural(mins, 'минуту', 'минуты', 'минут')}`);
    }

    if (precision === 'sec' || precision === 'cs') {
        if (precision === 'sec') {
            if (secs > 0 || hours > 0 || mins > 0) {
                parts.push(`${secs} ${plural(secs, 'секунду', 'секунды', 'секунд')}`);
            }
        } else {
            let csStr = String(cs).padStart(2, '0');
            parts.push(`${secs}.${csStr} ${plural(secs, 'секунды', 'секунд', 'секунд')}`);
        }
    }

    return parts.join(' ');
}

// ============================================================
//  ТЕМЫ
// ============================================================
function getThemeColor(varName, fallback = '#000000') {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return v || fallback;
    } catch (e) {
        return fallback;
    }
}

// ============================================================
//  УВЕДОМЛЕНИЯ — форматирование интервала оповещения
// ============================================================
// Принимает число + единицу ('min' | 'hour' | 'day' | 'week') и
// возвращает «15 минут», «2 часа», «1 день», «3 недели» и т.п.
function formatAdvanceText(value, unit) {
    const n = parseInt(value, 10) || 0;
    const forms = {
        min:  ['минуту', 'минуты', 'минут'],
        hour: ['час',    'часа',   'часов'],
        day:  ['день',   'дня',    'дней'],
        week: ['неделю', 'недели', 'недель'],
    };
    const f = forms[unit] || forms.min;
    return `${n} ${plural(n, f[0], f[1], f[2])}`;
}

// Миллисекунды для пары (число, единица).
function advanceToMs(value, unit) {
    const n = parseInt(value, 10) || 0;
    switch (unit) {
        case 'hour': return n * 60 * 60 * 1000;
        case 'day':  return n * 24 * 60 * 60 * 1000;
        case 'week': return n * 7 * 24 * 60 * 60 * 1000;
        case 'min':
        default:     return n * 60 * 1000;
    }
}