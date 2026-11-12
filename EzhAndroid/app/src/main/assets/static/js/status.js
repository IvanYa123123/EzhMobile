// Строка статуса под шапкой: «до пар / во время пары / после пар».
// Формат и точность задаются в настройках (см. state.js).

function _timeToMs(timeStr) {
    let [h, m] = timeStr.split(':').map(Number);
    return (h * 3600 + m * 60) * 1000;
}

function _nowMs() {
    let now = new Date();
    return ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
}

function _formatStatus(prefix, diffMs, absoluteTime) {
    let intervalStr = null;
    if (diffMs !== null && diffMs >= 0) {
        intervalStr = `через ${formatDurationMs(diffMs, statusPrecision)}`;
    }
    let timeStr = absoluteTime ? `в ${absoluteTime}` : null;

    if (statusFormat === 'time') {
        if (timeStr) return `${prefix} ${timeStr}`;
        if (intervalStr) return `${prefix} ${intervalStr}`;
        return prefix;
    }
    if (statusFormat === 'both') {
        if (intervalStr && timeStr) return `${prefix} ${intervalStr} (${timeStr})`;
        if (intervalStr) return `${prefix} ${intervalStr}`;
        if (timeStr) return `${prefix} ${timeStr}`;
        return prefix;
    }
    if (intervalStr) return `${prefix} ${intervalStr}`;
    if (timeStr) return `${prefix} ${timeStr}`;
    return prefix;
}

function _setStatusText(text) {
    ['scheduleStatus', 'dayScheduleStatus'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    });
}

function updateScheduleStatus() {
    if (!document.getElementById('scheduleStatus') && !document.getElementById('dayScheduleStatus')) return;

    if (typeof showStatus !== 'undefined' && !showStatus) {
        _setStatusText('');
        return;
    }

    if (!cachedSchedule || cachedSchedule.length === 0) {
        _setStatusText('');
        return;
    }

    let now = new Date();
    let nowMs = _nowMs();
    let todayStr = getLocalDateStr(now);

    // Записи без валидного time_range отсеиваем: _timeToMs(undefined) даст NaN.
    let todayPairs = cachedSchedule
        .filter(item => item.date === todayStr)
        .map(item => {
            const parts = (item.time_range || '').split(' - ');
            const start = parts[0] ? _timeToMs(parts[0]) : 0;
            const end   = parts[1] ? _timeToMs(parts[1]) : start;
            return Object.assign({}, item, { startMs: start, endMs: end });
        })
        .filter(p => p.startMs || p.endMs)
        .sort((a, b) => a.startMs - b.startMs);

    if (todayPairs.length > 0) {
        let current = todayPairs.find(p => p.startMs <= nowMs && nowMs < p.endMs);
        if (current) {
            let remaining = current.endMs - nowMs;
            let pairNum = current.n || '?';
            let endTime = fixTime(current.time_range.split(' - ')[1]);
            _setStatusText(_formatStatus(`Окончание ${pairNum} пары`, remaining, endTime));
            return;
        }

        let first = todayPairs[0];
        if (nowMs < first.startMs) {
            let until = first.startMs - nowMs;
            let startTime = fixTime(first.time_range.split(' - ')[0]);
            _setStatusText(_formatStatus('Начало пар', until, startTime));
            return;
        }

        let next = todayPairs.find(p => p.startMs > nowMs);
        if (next) {
            let until = next.startMs - nowMs;
            let startTime = fixTime(next.time_range.split(' - ')[0]);
            let pairNum = next.n || '?';
            _setStatusText(_formatStatus(`Начало ${pairNum} пары`, until, startTime));
            return;
        }

        setStatusForNextDay(now);
        return;
    }

    setStatusForNextDay(now);
}

function setStatusForNextDay(now) {
    let datesWithPairs = new Set(cachedSchedule.map(x => x.date));

    for (let i = 1; i <= 365; i++) {
        let d = new Date(now);
        d.setDate(d.getDate() + i);
        let dateStr = getLocalDateStr(d);

        if (!datesWithPairs.has(dateStr)) continue;

        let first = cachedSchedule
            .filter(x => x.date === dateStr && x.time_range && x.time_range.indexOf(' - ') !== -1)
            .sort((a, b) => (a.n || 0) - (b.n || 0))[0];
        if (!first) continue;

        let firstTime = fixTime(first.time_range.split(' - ')[0]);

        if (i === 1) {
            _setStatusText(_formatStatus('Начало пар завтра', null, firstTime));
        } else {
            _setStatusText(_formatStatus(`Начало пар ${formatDateRu(dateStr)}`, null, firstTime));
        }
        return;
    }

    _setStatusText('');
}
