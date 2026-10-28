// Уведомления о парах и событиях.
//
// Android: нативный мост EzhNative (AlarmManager + NotificationReceiver).
// Браузер: Web Notifications.
//
// scheduleAllNotifications() вызывается явно после загрузки расписания,
// после ручного рефреша и при изменении настроек. refreshNotifications()
// на Android оставлен для веб-пути — нативный планировщик он не трогает.

let _notificationCheckInterval = null;
let _notifiedMap = new Map();

const NOTIFICATION_CHECK_MS = 60 * 1000;
const NOTIFICATION_MAX_LOOKAHEAD_DAYS = 56;
const NATIVE_HORIZON_DAYS = 30;

function _hasNativeBridge() {
    return typeof window.EzhNative !== 'undefined' && window.EzhNative !== null;
}

function _nativeHasPermission() {
    if (!_hasNativeBridge()) return false;
    try { return window.EzhNative.hasNotificationPermission() === true; }
    catch (e) { return false; }
}

function _nativeCanExactAlarm() {
    if (!_hasNativeBridge()) return true;
    try { return window.EzhNative.canScheduleExactAlarms() === true; }
    catch (e) { return false; }
}

function initNotifications() {
    if (_notificationCheckInterval) clearInterval(_notificationCheckInterval);
    _notificationCheckInterval = setInterval(refreshNotifications, NOTIFICATION_CHECK_MS);
    refreshNotifications();

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refreshNotifications();
            // После возврата из фона — попытка досрочного пересчёта.
            scheduleAllNotifications();
        }
    });
}

function requestNotificationPermission() {
    if (_hasNativeBridge()) {
        try {
            if (!_nativeHasPermission()) window.EzhNative.requestNotificationPermission();
        } catch (e) {}
        return Promise.resolve(_nativeHasPermission() ? 'granted' : 'default');
    }
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied')  return Promise.resolve('denied');
    return Notification.requestPermission();
}

// ============================================================
//  НАТИВНОЕ ПЛАНИРОВАНИЕ
// ============================================================

function scheduleAllNotifications() {
    if (!notificationsEnabled) return;
    if (!_hasNativeBridge()) return;
    if (!_nativeHasPermission()) return;

    try {
        window.EzhNative.cancelAllNotifications();
        const nowMs = Date.now();
        const advanceMs = advanceToMs(notificationAdvance, notificationUnit);
        const horizonMs = NATIVE_HORIZON_DAYS * 24 * 60 * 60 * 1000;
        const advanceText = formatAdvanceText(notificationAdvance, notificationUnit);

        if (Array.isArray(cachedSchedule)) {
            cachedSchedule.forEach(pair => {
                const startMs = _itemStartMs(pair.date, pair.time_range);
                if (!startMs) return;
                const notifyMs = startMs - advanceMs;
                if (notifyMs <= nowMs) return;
                if (notifyMs > nowMs + horizonMs) return;
                const id = `pair-${pair.date}-${pair.n || 0}-${_slug(pair.lesson)}`;
                let body = pair.lesson || 'Пара';
                if (pair.location) body += ` — ${pair.location}`;
                if (pair.teacher)  body += `\n${pair.teacher}`;
                window.EzhNative.scheduleNotification(
                    id, `Пара через ${advanceText}`, body, notifyMs);
            });
        }

        if (typeof getCustomItemsForDate === 'function'
                && typeof customScheduleItems !== 'undefined') {
            const today = new Date();
            for (let i = 0; i <= NATIVE_HORIZON_DAYS; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() + i);
                const dateStr = getLocalDateStr(d);
                let items = [];
                try { items = getCustomItemsForDate(dateStr) || []; }
                catch (e) { continue; }
                items.forEach(ev => {
                    if (ev.is_event !== 1) return;
                    const startMs = _itemStartMs(dateStr, ev.time_range);
                    if (!startMs) return;
                    const notifyMs = startMs - advanceMs;
                    if (notifyMs <= nowMs) return;
                    if (notifyMs > nowMs + horizonMs) return;
                    const id = `event-${dateStr}-${_slug(ev.lesson)}`;
                    let body = ev.lesson || 'Событие';
                    if (ev.location) body += ` — ${ev.location}`;
                    if (ev.teacher)  body += `\n${ev.teacher}`;
                    body += `\n📅 ${formatDateRu(dateStr)}, ${ev.time_range}`;
                    window.EzhNative.scheduleNotification(
                        id, `Событие через ${advanceText}`, body, notifyMs);
                });
            }
        }
    } catch (e) {
        console.error('[notifications] native schedule failed', e);
    }
}

// ============================================================
//  ВЕБ-ПУТЬ (десктоп/браузер). На Android не используется.
// ============================================================

function refreshNotifications() {
    if (!notificationsEnabled) return;
    if (_hasNativeBridge()) return;              // планируется нативно
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const nowMs = Date.now();
    const advanceMs = advanceToMs(notificationAdvance, notificationUnit);
    const lookaheadMs = Math.max(
        advanceMs,
        NOTIFICATION_MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    const CUTOFF = 30 * 24 * 60 * 60 * 1000;
    for (const [k, ts] of _notifiedMap) {
        if (nowMs - ts > CUTOFF) _notifiedMap.delete(k);
    }

    if (typeof cachedSchedule !== 'undefined' && Array.isArray(cachedSchedule)) {
        cachedSchedule.forEach(pair => {
            const startMs = _itemStartMs(pair.date, pair.time_range);
            if (!startMs) return;
            const notifyMs = startMs - advanceMs;
            if (nowMs < notifyMs) return;
            if (nowMs >= startMs) return;

            const key = `pair|${pair.date}|${pair.n}|${pair.lesson}|${pair.time_range}`;
            if (_notifiedMap.has(key)) return;
            _notifiedMap.set(key, nowMs);

            const advanceText = formatAdvanceText(notificationAdvance, notificationUnit);
            let body = pair.lesson || 'Пара';
            if (pair.location) body += ` — ${pair.location}`;
            if (pair.teacher)  body += `\n${pair.teacher}`;
            _fireNotification(`Пара через ${advanceText}`, body, key);
        });
    }

    if (typeof getCustomItemsForDate === 'function'
            && typeof customScheduleItems !== 'undefined') {
        const daysAhead = Math.min(
            NOTIFICATION_MAX_LOOKAHEAD_DAYS,
            Math.ceil(lookaheadMs / (24 * 60 * 60 * 1000)) + 1);
        const today = new Date();
        for (let i = 0; i <= daysAhead; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const dateStr = getLocalDateStr(d);
            let items = [];
            try { items = getCustomItemsForDate(dateStr) || []; }
            catch (e) { continue; }
            items.forEach(ev => {
                if (ev.is_event !== 1) return;
                const startMs = _itemStartMs(dateStr, ev.time_range);
                if (!startMs) return;
                const notifyMs = startMs - advanceMs;
                if (nowMs < notifyMs) return;
                if (nowMs >= startMs) return;

                const key = `event|${dateStr}|${ev.lesson}|${ev.time_range}`;
                if (_notifiedMap.has(key)) return;
                _notifiedMap.set(key, nowMs);

                const advanceText = formatAdvanceText(notificationAdvance, notificationUnit);
                let body = ev.lesson || 'Событие';
                if (ev.location) body += ` — ${ev.location}`;
                if (ev.teacher)  body += `\n${ev.teacher}`;
                body += `\n📅 ${formatDateRu(dateStr)}, ${ev.time_range}`;
                _fireNotification(`Событие через ${advanceText}`, body, key);
            });
        }
    }
}

function _slug(s) {
    return String(s || '').replace(/[^a-zA-Zа-яА-Я0-9]/g, '_').slice(0, 40);
}

function _itemStartMs(dateStr, timeRange) {
    if (!dateStr || !timeRange) return null;
    const parts = String(timeRange).split(' - ');
    if (parts.length < 2) return null;
    const [h, m] = parts[0].trim().split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    const [y, mo, d] = dateStr.split('-').map(Number);
    if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;
    return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

function _fireNotification(title, body, tag) {
    try {
        new Notification(title, { body, tag, requireInteraction: false });
    } catch (e) {
        console.error('Notification failed:', e);
    }
}
