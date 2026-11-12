// Сгенерировано scripts/build_js_bundle.py — не редактировать вручную.

;
// --- state.js ---
// `var`, а не `let`: mobile.js и calendar.js читают window.expandedDayDateStr.
var expandedDayDateStr = null;

let currentBaseDate = new Date();
currentBaseDate.setDate(currentBaseDate.getDate() - (currentBaseDate.getDay() === 0 ? 6 : currentBaseDate.getDay() - 1));

let cachedSchedule = [];
let cachedLabs = {};
let cachedSubjectSettings = {};
let globalChart = null;
let globalLabChart = null;
let currentSubjectsList = [];

let validGroups = new Set();
let allGroups = [];
let groupsLoaded = false;
let groupsLoadFailed = false;

// JSON.parse в try/catch: битый localStorage не должен ронять загрузку скриптов.
function _safeParse(raw, fallback) {
    if (raw == null) return fallback;
    try {
        const v = JSON.parse(raw);
        return v == null ? fallback : v;
    } catch (e) {
        return fallback;
    }
}

let friendsList = [];
let friendsSchedules = {};
let draggingFriendId = null;
let editingFriendId = null;
let draggingDropdownFriendId = null;

let customScheduleItems = [];

let showTeacher  = localStorage.getItem('showTeacher')  !== 'false';
let showLocation = localStorage.getItem('showLocation') !== 'false';
let showFriends  = localStorage.getItem('showFriends')  !== 'false';

let showStatus = localStorage.getItem('showStatus') !== 'false';
let statusFormat = localStorage.getItem('statusFormat') || 'interval';
let statusPrecision = localStorage.getItem('statusPrecision') || 'min';
if (!['min', 'sec', 'cs'].includes(statusPrecision)) statusPrecision = 'min';

function getStatusTickMs() {
    if (statusPrecision === 'cs')  return 100;
    if (statusPrecision === 'sec') return 1000;
    return 30000;
}
let _statusIntervalId = null;

let notificationsEnabled = localStorage.getItem('notificationsEnabled') === 'true';

let notificationAdvance = parseInt(localStorage.getItem('notificationAdvance') || '', 10);
let notificationUnit    = localStorage.getItem('notificationUnit') || '';

if (isNaN(notificationAdvance) || notificationAdvance < 1) {
    const legacy = parseInt(localStorage.getItem('notificationMinutes') || '15', 10);
    notificationAdvance = (isNaN(legacy) || legacy < 1) ? 15 : legacy;
}
if (notificationAdvance > 60) notificationAdvance = 60;

if (!['min', 'hour', 'day', 'week'].includes(notificationUnit)) {
    notificationUnit = 'min';
}

let theme = localStorage.getItem('theme') || 'light';
// «Своя тема» удалена из интерфейса: сохранённое значение сбрасываем.
if (theme === 'custom') {
    theme = 'light';
    try { localStorage.setItem('theme', 'light'); } catch (e) {}
}

let taskDatesSet = new Set();

let loaderInterval = null;

let showWidgetMiniCal = localStorage.getItem('showWidgetMiniCal') !== 'false';
let showWidgetGlobal  = localStorage.getItem('showWidgetGlobal')  !== 'false';
let showWidgetLabs    = localStorage.getItem('showWidgetLabs')    !== 'false';
let showWidgetPacing  = localStorage.getItem('showWidgetPacing')  !== 'false';
// Флаги для виджетов, чьи JS-файлы не входят в базовую сборку.
let showWidgetSuggestions = localStorage.getItem('showWidgetSuggestions') !== 'false';
let showWidgetLabsPro     = localStorage.getItem('showWidgetLabsPro')     !== 'false';
let showWidgetMoodleAvg   = localStorage.getItem('showWidgetMoodleAvg')   !== 'false';
let showWidgetMoodleSubj  = localStorage.getItem('showWidgetMoodleSubj')  !== 'false';
// Заметки в колонках дней: settings.js читает эти флаги напрямую.
let showWidgetNotes1 = localStorage.getItem('showWidgetNotes1') !== 'false';
let showWidgetNotes2 = localStorage.getItem('showWidgetNotes2') !== 'false';
let showWidgetNotes3 = localStorage.getItem('showWidgetNotes3') !== 'false';

// Переменная для вкладки "Люди" (friends или teachers)
let friendsTeachersTab = localStorage.getItem('friendsTeachersTab') || 'friends';

function applyFriendsTeachersVisibility() {
    const friendsEl   = document.getElementById('friendsSection');
    const teachersEl  = document.getElementById('teachersSection');
    const btnFriends  = document.getElementById('btnTabFriends');
    const btnTeachers = document.getElementById('btnTabTeachers');
    if (!friendsEl || !teachersEl) return;

    const isFriends = (friendsTeachersTab === 'friends');

    if (btnFriends)  btnFriends.checked  = isFriends;
    if (btnTeachers) btnTeachers.checked = !isFriends;

    const labelFriends  = document.querySelector('label[for="btnTabFriends"]');
    const labelTeachers = document.querySelector('label[for="btnTabTeachers"]');
    if (labelFriends)  labelFriends.classList.toggle('active',  isFriends);
    if (labelTeachers) labelTeachers.classList.toggle('active', !isFriends);

    if (isFriends) {
        friendsEl.style.display = '';
        teachersEl.style.display = 'none';
    } else {
        friendsEl.style.display = 'none';
        teachersEl.style.display = '';
    }
}

function switchFriendsTeachersTab(tab) {
    if (tab !== 'friends' && tab !== 'teachers') return;
    friendsTeachersTab = tab;
    try { localStorage.setItem('friendsTeachersTab', tab); } catch (e) {}
    applyFriendsTeachersVisibility();

    if (tab === 'teachers' && typeof renderTeachersCalendars === 'function') {
        try { renderTeachersCalendars(); } catch (e) { console.error(e); }
    }
    if (tab === 'friends' && typeof renderFriendsCalendar === 'function') {
        try { renderFriendsCalendar(); } catch (e) { console.error(e); }
    }
}

// ============================================================
//  МИНИ-ЗАГЛУШКИ ДЛЯ НЕОБЯЗАТЕЛЬНЫХ МОДУЛЕЙ
// ============================================================

function renderSuggestions() {
    const el = document.getElementById('suggestionsContent');
    if (el) {
        el.innerHTML = '<div class="text-muted small text-center py-2">Модуль предложений не подключён.</div>';
    }
    const nav = document.getElementById('suggestionsNavRow');
    if (nav) nav.style.display = 'none';
}
function suggestionsPrev() {}
function suggestionsNext() {}

function openMoodleModal() {
    alert('Еж Про (Moodle) не подключён в этой сборке.');
}
function doMoodleLogin() {}
function loadMoodleStats() {}
function openMoodleSetupModal() {}
function saveMoodleSetup() {}
function doMoodleLogout() {}
function renderProSubjectChart() {}
function allowDrop(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
}
function handleSemesterDrop(e, target) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
}

// ============================================================
//  SYNC TIMES
// ============================================================

function loadSyncTimes() {
    try {
        const raw = localStorage.getItem('sync_times');
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
}

function saveSyncTime(group, subgroup) {
    try {
        const map = loadSyncTimes();
        map[`${group}_${subgroup}`] = Date.now();
        localStorage.setItem('sync_times', JSON.stringify(map));
    } catch (e) {}
}

function getSyncTime(group, subgroup) {
    const map = loadSyncTimes();
    return map[`${group}_${subgroup}`] || null;
}

// ============================================================
//  UNDO
// ============================================================

let _undoTimer = null;
let _undoCallback = null;

function scheduleUndo(message, callback, durationMs = 6000) {
    if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
    _undoCallback = callback;

    if (typeof showUndoBar === 'function') {
        showUndoBar(message, () => {
            const cb = _undoCallback;
            _undoCallback = null;
            if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
            if (typeof hideUndoBar === 'function') hideUndoBar();
            if (typeof cb === 'function') cb();
        });
    }

    _undoTimer = setTimeout(() => {
        _undoCallback = null;
        _undoTimer = null;
        if (typeof hideUndoBar === 'function') hideUndoBar();
    }, durationMs);
}

function cancelUndo() {
    if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
    _undoCallback = null;
    if (typeof hideUndoBar === 'function') hideUndoBar();
}

// ============================================================
//  ВИДЖЕТ «ЗАМЕТКИ» (1/2/3)
// ============================================================

function initNotesWidget() {
    for (let i = 1; i <= 3; i++) {
        const ta = document.getElementById('notesWidgetText' + i);
        if (!ta) continue;
        try {
            ta.value = localStorage.getItem('notesWidget' + i) || '';
        } catch (e) {}
    }
}

function onNotesWidgetInput(el) {
    if (!el || !el.id) return;
    const n = el.id.replace('notesWidgetText', '');
    if (!n) return;
    try {
        localStorage.setItem('notesWidget' + n, el.value);
    } catch (e) {}
}

//  ПРОКРУТКА: _verticalDayOffset сбрасывает weeks.js

let _verticalDayOffset = null;

// ============================================================
//  МИНИ-КАЛЕНДАРЬ: ПАНЕЛЬ СОБЫТИЙ
// ============================================================

let _miniCalEventsTimer = null;
let _miniCalEventsToken = 0;

function refreshMiniCalEvents() {
    if (_miniCalEventsTimer) clearTimeout(_miniCalEventsTimer);
    _miniCalEventsTimer = setTimeout(_renderMiniCalEventsNow, 150);
}

async function _renderMiniCalEventsNow() {
    const container = document.getElementById('miniCalEvents');
    if (!container) return;

    const card = document.getElementById('widgetMiniCalCard');
    if (!card || !card.classList.contains('is-horizontal')) {
        container.innerHTML = '';
        return;
    }

    const token = ++_miniCalEventsToken;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = getLocalDateStr(today);
    const MAX_DAYS = 90;

    const events = [];
    for (let i = 0; i < MAX_DAYS; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = getLocalDateStr(d);

        let items = [];
        try { items = getCustomItemsForDate(dateStr) || []; } catch (e) { continue; }

        items.forEach(ev => {
            if (!ev.is_event) return;
            events.push({
                date: dateStr,
                time: ev.time_range || '',
                title: ev.lesson || 'Событие',
            });
        });
    }

    let tasks = [];
    try {
        const endD = new Date(today);
        endD.setDate(endD.getDate() + MAX_DAYS);
        const endStr = getLocalDateStr(endD);
        const raw = await apiLoadTasks(todayStr, endStr);
        tasks = (Array.isArray(raw) ? raw : [])
            .filter(t => t.status !== 'completed')
            .map(t => ({
                date: t.date,
                time: '',
                title: t.text || 'Заметка',
            }));
    } catch (e) {
        tasks = [];
    }

    if (token !== _miniCalEventsToken) return;

    const sorter = (a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time || '').localeCompare(b.time || '');
    };
    events.sort(sorter);
    tasks.sort(sorter);

    const eventsLimited = events.slice(0, 30);
    const tasksLimited  = tasks.slice(0, 30);

    let html = '<div class="mini-cal-events-cols">';

    html += '<div class="mini-cal-events-col">';
    html += '<div class="mini-cal-events-col-header">📝 Заметки</div>';
    if (tasksLimited.length === 0) {
        html += '<div class="mini-cal-events-empty">Нет заметок</div>';
    } else {
        tasksLimited.forEach(item => { html += _renderMiniCalRow(item); });
    }
    html += '</div>';

    html += '<div class="mini-cal-events-col">';
    html += '<div class="mini-cal-events-col-header">🎯 События</div>';
    if (eventsLimited.length === 0) {
        html += '<div class="mini-cal-events-empty">Нет событий</div>';
    } else {
        eventsLimited.forEach(item => { html += _renderMiniCalRow(item); });
    }
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
}

function _renderMiniCalRow(item) {
    const timeHtml = item.time
        ? `<span class="mini-cal-events-time">${escapeHtml(item.time.split(' - ')[0])}</span>`
        : '<span class="mini-cal-events-time mini-cal-events-time-empty">—</span>';
    return '<div class="mini-cal-events-item">'
         + `<span class="mini-cal-events-date">${escapeHtml(formatDateRu(item.date))}</span>`
         + timeHtml
         + `<span class="mini-cal-events-title">${escapeHtml(item.title)}</span>`
         + '</div>';
}

// ============================================================
//  DRAG & DROP ВИДЖЕТОВ
// ============================================================

// Десктопная зона виджетов называется desktopRightWidgetsZone (см. index.html).
const _widgetZoneIds = [
    'desktopRightWidgetsZone',
    'rightWidgetsZone',
    'underCalendarWidgetsZone',
    'mainColumnSections',
];

const _WIDE_ZONE_IDS = [
    'underCalendarWidgetsZone',
    'mainColumnSections',
];

const _ROW_WRAP_ZONE_IDS = [];

const WIDGET_LAYOUT_KEY = 'widgetLayout';

const _HORIZONTAL_PLACEHOLDER_H = 200;
const _VERTICAL_PLACEHOLDER_W = 320;
const _VERTICAL_PLACEHOLDER_H = 180;
const _PLACEHOLDER_HYSTERESIS = 30;

const _DRAG_EDGE_PX = 90;
const _DRAG_EDGE_STEP = 14;
const _DRAG_EDGE_THROTTLE = 16;

const _DRAG_HEDGEHOG_URL  = '/static/img/hedgehog.svg';
const _DRAG_HEDGEHOG_SIZE = 64;

let _hedgehogSvgMarkup = '';

const _HEDGEHOG_INLINE_SVG =
    '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">'
  + '<path fill="#6b3f1a" d="M20 55 L28 30 L36 48 L44 25 L52 45 L60 22 L68 44 L76 28 L82 52 Z"/>'
  + '<path fill="#f5d9a8" d="M15 62 Q15 45 35 45 L75 45 Q85 45 85 62 Q85 82 50 82 Q15 82 15 62 Z"/>'
  + '<path fill="#f5d9a8" d="M15 62 Q5 62 5 68 Q5 75 15 75 Z"/>'
  + '<circle cx="10" cy="68" r="2" fill="#2a1505"/>'
  + '<circle cx="28" cy="58" r="2.5" fill="#2a1505"/>'
  + '<ellipse cx="32" cy="81" rx="4" ry="3" fill="#dcb87c"/>'
  + '<ellipse cx="55" cy="81" rx="4" ry="3" fill="#dcb87c"/>'
  + '</svg>';

const _LEG_DURATION_SLOW = 1.20;
const _LEG_DURATION_FAST = 0.15;
const _LEG_SPEED_LOW  = 0.2;
const _LEG_SPEED_HIGH = 2.5;
const _LEG_SPEED_EMA = 0.35;
const _DRAG_DIR_MIN_PX = 1.5;

let _dragStartSize = { w: 0, h: 0 };
let _lastEdgeScrollTs = 0;
let _dragState = null;
let _ghostEl = null;
let _cursorStyleInjected = false;

function _ensureDragCursorStyle() {
    if (_cursorStyleInjected) return;
    _cursorStyleInjected = true;
    const s = document.createElement('style');
    s.id = 'drag-cursor-style';
    s.textContent = `
        body.widget-dragging,
        body.widget-dragging * {
            cursor: grabbing !important;
        }
    `;
    document.head.appendChild(s);
}

function initWidgetDragAndDrop() {
    document.querySelectorAll('.widget-drag-handle, .section-drag-handle')
        .forEach(h => h.removeAttribute('draggable'));

    _ensureDragCursorStyle();
    _preloadHedgehogSvg();

    _restoreLayout();
    _widgetZoneIds.forEach(id => _initSortableZone(id));

    _applyHorizontalLayoutSync();
}

function _preloadHedgehogSvg() {
    _hedgehogSvgMarkup = _HEDGEHOG_INLINE_SVG;

    fetch(_DRAG_HEDGEHOG_URL)
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        })
        .then(text => {
            if (text && text.indexOf('<svg') !== -1) {
                _hedgehogSvgMarkup = text;
            }
        })
        .catch(() => {});
}

function _widgetZoneSelector() {
    return '.widget-card, [data-draggable-section]';
}

function _isWideZone(el) {
    return !!(el && el.id && _WIDE_ZONE_IDS.indexOf(el.id) !== -1);
}

function _isRowWrapZone(el) {
    return !!(el && el.id && _ROW_WRAP_ZONE_IDS.indexOf(el.id) !== -1);
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ ЗОНЫ
// ============================================================

function _initSortableZone(zoneId) {
    const zone = document.getElementById(zoneId);
    if (!zone) return;
    if (zone.dataset.dragInit === '1') return;
    zone.dataset.dragInit = '1';

    zone.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (_dragState) return;

        const handle = e.target.closest('.widget-drag-handle, .section-drag-handle');
        if (!handle || !zone.contains(handle)) return;

        const card = handle.closest(_widgetZoneSelector());
        if (!card || !zone.contains(card)) return;

        e.preventDefault();
        _startDrag(card, e);
    });
}

// ============================================================
//  СТАРТ / ДВИЖЕНИЕ / КОНЕЦ
// ============================================================

function _startDrag(card, e) {
    _dragState = {
        card: card,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        lastT: performance.now(),
        speedEma: 0,
        dir: 0,
    };

    _dragStartSize = { w: card.offsetWidth, h: card.offsetHeight };

    card.classList.add('widget-dragging');
    document.body.classList.add('widget-dragging');
    window._draggingWidgetId = card.id;

    _createGhost(e.clientX, e.clientY);
    _scheduleDragLayoutRefresh();

    document.addEventListener('pointermove', _onDragMove, { passive: false });
    document.addEventListener('pointerup', _onDragUp);
    document.addEventListener('pointercancel', _onDragCancel);
    document.addEventListener('wheel', _onDragWheel, { passive: false, capture: true });
    document.addEventListener('keydown', _onDragKey, true);

    _onDragMove(e);
}

function _onDragMove(e) {
    if (!_dragState) return;
    e.preventDefault();

    const now = performance.now();
    const dt = Math.max(1, now - _dragState.lastT);
    const dx = e.clientX - _dragState.lastX;
    const dy = e.clientY - _dragState.lastY;
    const instantSpeed = Math.sqrt(dx * dx + dy * dy) / dt;

    _dragState.lastX = e.clientX;
    _dragState.lastY = e.clientY;
    _dragState.lastT = now;

    const k = _LEG_SPEED_EMA;
    _dragState.speedEma = _dragState.speedEma * (1 - k) + instantSpeed * k;

    const t = Math.max(0, Math.min(1,
        (_dragState.speedEma - _LEG_SPEED_LOW) /
        (_LEG_SPEED_HIGH - _LEG_SPEED_LOW)
    ));
    const legDuration = _LEG_DURATION_SLOW +
        (_LEG_DURATION_FAST - _LEG_DURATION_SLOW) * t;

    let newDir = _dragState.dir;
    if (Math.abs(dx) > _DRAG_DIR_MIN_PX) {
        newDir = dx > 0 ? 1 : -1;
    }

    const inner = _ghostEl && _ghostEl.firstElementChild;
    if (inner) {
        const svg = inner.querySelector('svg') || inner;
        svg.style.setProperty('--leg-duration', legDuration.toFixed(3) + 's');

        if (newDir !== 0 && newDir !== _dragState.dir) {
            _dragState.dir = newDir;
            inner.classList.toggle('is-flipped', newDir < 0);
        }
    }

    _moveGhost(e.clientX, e.clientY);
    _autoScrollIfNearEdge(e);

    const zone = _zoneUnderPoint(e.clientX, e.clientY);
    if (!zone) {
        _removeDropPlaceholder();
        return;
    }

    _positionPlaceholder(zone, _dragState.card, e);
}

function _onDragUp(e) {
    if (!_dragState) return;

    const card = _dragState.card;
    const ph = window._dropPlaceholder;

    if (ph && ph.parentElement) {
        ph.parentElement.insertBefore(card, ph);
    }

    _endDrag();
}

function _onDragCancel() {
    if (!_dragState) return;
    _endDrag();
}

function _onDragKey(e) {
    if (!_dragState) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        _endDrag();
    }
}

function _onDragWheel(e) {
    if (!_dragState) return;
    e.preventDefault();
    window.scrollBy(0, e.deltaY);
}

function _endDrag() {
    if (!_dragState) return;

    const card = _dragState.card;
    _dragState = null;

    card.classList.remove('widget-dragging');
    document.body.classList.remove('widget-dragging');
    window._draggingWidgetId = null;
    _dragStartSize = { w: 0, h: 0 };

    _destroyGhost();
    _removeDropPlaceholder();

    document.removeEventListener('pointermove', _onDragMove);
    document.removeEventListener('pointerup', _onDragUp);
    document.removeEventListener('pointercancel', _onDragCancel);
    document.removeEventListener('wheel', _onDragWheel, { capture: true });
    document.removeEventListener('keydown', _onDragKey, true);

    _scheduleDragLayoutRefresh();
    _updateHorizontalLayout();

    _saveLayout();
    _refreshAfterMove(card);
}

// ============================================================
//  SVG-ЁЖИК-ПРИЗРАК
// ============================================================

function _createGhost(x, y) {
    _destroyGhost();

    const wrap = document.createElement('div');
    wrap.className = 'drag-hedgehog-wrap';
    wrap.style.width  = _DRAG_HEDGEHOG_SIZE + 'px';
    wrap.style.height = _DRAG_HEDGEHOG_SIZE + 'px';
    wrap.style.transform = 'translate(-9999px, -9999px)';

    const inner = document.createElement('div');
    inner.className = 'drag-hedgehog';
    inner.innerHTML = _hedgehogSvgMarkup ||
        '<div style="font-size:56px;line-height:1;">🦔</div>';

    const svg = inner.querySelector('svg');
    if (svg) svg.style.setProperty('--leg-duration', _LEG_DURATION_SLOW.toFixed(3) + 's');

    wrap.appendChild(inner);
    document.body.appendChild(wrap);

    _ghostEl = wrap;
    _moveGhost(x, y);
}

function _moveGhost(x, y) {
    if (!_ghostEl) return;
    const half = _DRAG_HEDGEHOG_SIZE / 2;
    _ghostEl.style.transform = 'translate(' + (x - half) + 'px, ' + (y - half) + 'px)';
}

function _destroyGhost() {
    if (_ghostEl && _ghostEl.parentElement) {
        _ghostEl.parentElement.removeChild(_ghostEl);
    }
    _ghostEl = null;
}

// ============================================================
//  ОПРЕДЕЛЕНИЕ ЗОНЫ ПОД КУРСОРОМ
// ============================================================

function _zoneUnderPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (el) {
        const zone = el.closest('#rightWidgetsZone, #desktopRightWidgetsZone, #underCalendarWidgetsZone, #mainColumnSections');
        if (zone) return zone;
    }

    const _pad = 20;
    const candidates = [];

    for (const id of _widgetZoneIds) {
        const z = document.getElementById(id);
        if (!z) continue;
        const r = z.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (x >= r.left - _pad && x <= r.right + _pad) {
            candidates.push({ zone: z, rect: r });
        }
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].zone;

    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
        let dist = 0;
        if (y < c.rect.top)         dist = c.rect.top - y;
        else if (y > c.rect.bottom) dist = y - c.rect.bottom;
        if (dist < bestDist) {
            bestDist = dist;
            best     = c.zone;
        }
    }
    return best;
}

// ============================================================
//  АВТОСКРОЛЛ У КРАЯ
// ============================================================

function _autoScrollIfNearEdge(e) {
    if (!_dragState) return;

    const now = Date.now();
    if (now - _lastEdgeScrollTs < _DRAG_EDGE_THROTTLE) return;

    const y = e.clientY;
    const h = window.innerHeight;

    if (y < _DRAG_EDGE_PX) {
        _lastEdgeScrollTs = now;
        window.scrollBy(0, -_DRAG_EDGE_STEP);
    } else if (y > h - _DRAG_EDGE_PX) {
        _lastEdgeScrollTs = now;
        window.scrollBy(0, _DRAG_EDGE_STEP);
    }
}

// ============================================================
//  ФОРМАТ ВИДЖЕТА
// ============================================================

let _hLayoutRaf = null;

function _applyHorizontalLayoutSync() {
    document.querySelectorAll(_widgetZoneSelector()).forEach(el => {
        const isHorizontal = _isWideZone(el.parentElement);
        el.classList.toggle('is-horizontal', isHorizontal);
        el.classList.toggle('is-vertical', !isHorizontal);
    });
}

function _updateHorizontalLayout() {
    _applyHorizontalLayoutSync();

    if (_hLayoutRaf) cancelAnimationFrame(_hLayoutRaf);
    _hLayoutRaf = requestAnimationFrame(() => {
        _hLayoutRaf = null;
        _applyHorizontalLayoutSync();

        if (typeof globalChart !== 'undefined' && globalChart) {
            try { globalChart.resize(); } catch (e) {}
        }
        if (typeof globalLabChart !== 'undefined' && globalLabChart) {
            try { globalLabChart.resize(); } catch (e) {}
        }

        if (typeof refreshMiniCalEvents === 'function') refreshMiniCalEvents();
    });
}

window._updateHorizontalLayout = _updateHorizontalLayout;

let _dragLayoutTimer = null;

function _scheduleDragLayoutRefresh() {
    if (_dragLayoutTimer) clearTimeout(_dragLayoutTimer);
    _dragLayoutTimer = setTimeout(() => {
        _dragLayoutTimer = null;
        _updateHorizontalLayout();
    }, 60);
}

// ============================================================
//  ПОЗИЦИОНИРОВАНИЕ ПЛЕЙСХОЛДЕРА
// ============================================================

function _visibleCards(zone, excluded) {
    return [...zone.querySelectorAll(_widgetZoneSelector())]
        .filter(c => c !== excluded)
        .filter(c => {
            const r = c.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
}

function _positionPlaceholder(zone, dragged, e) {
    if (!zone.clientWidth || !zone.clientHeight) return;

    const ph = window._dropPlaceholder;

    let targetCard = e.target && e.target.closest && e.target.closest(_widgetZoneSelector());
    if (targetCard === dragged || targetCard === ph) targetCard = null;
    if (targetCard) {
        const tr = targetCard.getBoundingClientRect();
        if (tr.width === 0 || tr.height === 0) targetCard = null;
    }

    if (!targetCard) {
        const cards = _visibleCards(zone, dragged).filter(c => c !== ph);

        if (cards.length === 0) {
            _showDropPlaceholderAtEnd(zone, dragged);
            return;
        }

        let closest = null;
        let minDist = Infinity;
        for (const c of cards) {
            const r = c.getBoundingClientRect();
            const midY = r.top + r.height / 2;
            const dist = Math.abs(e.clientY - midY);
            if (dist < minDist) { minDist = dist; closest = c; }
        }
        targetCard = closest;
    }

    if (!targetCard) {
        _showDropPlaceholderAtEnd(zone, dragged);
        return;
    }

    const rect = targetCard.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const distFromCenter = e.clientY - center;

    let before;
    if (_isRowWrapZone(zone)) {
        const sameRow = e.clientY >= rect.top - 4 && e.clientY <= rect.bottom + 4;
        before = sameRow
            ? (e.clientX < rect.left + rect.width / 2)
            : (e.clientY < center);
    } else {
        before = distFromCenter < 0;
    }

    if (ph
        && ph.parentElement === zone
        && ph.dataset.forId === targetCard.id) {
        const prevBefore = ph.dataset.before === 'true';
        if (prevBefore !== before && Math.abs(distFromCenter) < _PLACEHOLDER_HYSTERESIS) {
            return;
        }
    }

    _showDropPlaceholder(targetCard, before);
}

// ============================================================
//  ПЛЕЙСХОЛДЕР
// ============================================================

function _calcPlaceholderSize(zone, dragged) {
    if (_isWideZone(zone)) {
        const zoneW = zone.clientWidth || 0;
        return { w: zoneW, h: _HORIZONTAL_PLACEHOLDER_H };
    }

    if (_dragStartSize.w > 0 && _dragStartSize.h > 0) {
        return { w: _dragStartSize.w, h: _dragStartSize.h };
    }
    return { w: _VERTICAL_PLACEHOLDER_W, h: _VERTICAL_PLACEHOLDER_H };
}

function _showDropPlaceholder(targetCard, before) {
    const current = window._dropPlaceholder;
    const dragged = _dragState ? _dragState.card : null;
    const zone = targetCard.parentElement;
    if (!zone) return;

    const { w, h } = _calcPlaceholderSize(zone, dragged);

    if (current
        && current.dataset.forId === targetCard.id
        && current.dataset.before === String(before)
        && current.parentElement === zone) {
        if (w && current.style.width  !== w + 'px') current.style.width  = w + 'px';
        if (h && current.style.height !== h + 'px') current.style.height = h + 'px';
        return;
    }

    _removeDropPlaceholder();

    const ph = document.createElement('div');
    ph.className = 'widget-drop-placeholder';
    ph.dataset.forId = targetCard.id;
    ph.dataset.before = String(before);
    if (w) ph.style.width  = w + 'px';
    if (h) ph.style.height = h + 'px';
    ph.style.flex = '0 0 auto';

    if (before) {
        zone.insertBefore(ph, targetCard);
    } else {
        zone.insertBefore(ph, targetCard.nextSibling);
    }

    window._dropPlaceholder = ph;
}

function _showDropPlaceholderAtEnd(zone, dragged) {
    const current = window._dropPlaceholder;

    if (current
        && current.parentElement === zone
        && current.dataset.atEnd === '1'
        && !current.nextElementSibling) {
        return;
    }

    _removeDropPlaceholder();

    const { w, h } = _calcPlaceholderSize(zone, dragged);

    const ph = document.createElement('div');
    ph.className = 'widget-drop-placeholder';
    ph.dataset.atEnd = '1';
    if (w) ph.style.width  = w + 'px';
    if (h) ph.style.height = h + 'px';
    ph.style.flex = '0 0 auto';

    zone.appendChild(ph);
    window._dropPlaceholder = ph;
}

function _removeDropPlaceholder() {
    const ph = window._dropPlaceholder;
    if (ph && ph.parentElement) ph.parentElement.removeChild(ph);
    window._dropPlaceholder = null;
}

function _refreshAfterMove(card) {
    _applyHorizontalLayoutSync();
    _updateHorizontalLayout();

    setTimeout(() => {
        _applyHorizontalLayoutSync();

        if (typeof renderFriendsCalendar === 'function') renderFriendsCalendar();
        if (typeof renderTeachersCalendars === 'function') renderTeachersCalendars();

        if (card.id === 'widgetMiniCalCard' && typeof refreshMiniCalEvents === 'function') {
            try { refreshMiniCalEvents(); } catch (e) { console.error(e); }
        }
        if (card.id === 'widgetGlobalCard' && typeof _renderGlobalStatsDetails === 'function') {
            try { _renderGlobalStatsDetails(); } catch (e) { console.error(e); }
        }
        if (card.id === 'widgetLabsCard' && typeof _renderLabStatsDetails === 'function') {
            try { _renderLabStatsDetails(); } catch (e) { console.error(e); }
        }
        if (typeof renderCharts === 'function') {
            try { renderCharts(); } catch (e) { console.error(e); }
        }

        if (typeof globalChart !== 'undefined' && globalChart) {
            try { globalChart.resize(); } catch (e) {}
        }
        if (typeof globalLabChart !== 'undefined' && globalLabChart) {
            try { globalLabChart.resize(); } catch (e) {}
        }
    }, 80);
}

function _saveLayout() {
    const layout = {};
    _widgetZoneIds.forEach(id => {
        const zone = document.getElementById(id);
        if (!zone) return;
        layout[id] = [...zone.querySelectorAll(_widgetZoneSelector())].map(c => c.id);
    });
    try { localStorage.setItem(WIDGET_LAYOUT_KEY, JSON.stringify(layout)); } catch (e) {}
}

function _restoreLayout() {
    let layout;
    try {
        layout = JSON.parse(localStorage.getItem(WIDGET_LAYOUT_KEY) || 'null');
    } catch (e) { return; }
    if (!layout || typeof layout !== 'object') return;

    const allCards = {};
    document.querySelectorAll(_widgetZoneSelector()).forEach(c => { allCards[c.id] = c; });

    _widgetZoneIds.forEach(zoneId => {
        const zone = document.getElementById(zoneId);
        if (!zone) return;
        const ids = Array.isArray(layout[zoneId]) ? layout[zoneId] : [];
        ids.forEach(id => {
            const card = allCards[id];
            if (card) zone.appendChild(card);
        });
    });
}

;
// --- utils.js ---
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

// Безопасный href: только http(s)/mailto, экранируем кавычки/угловые.
// Возвращает '' для недопустимых схем — тогда рендерится span вместо <a>.
function safeHref(url) {
    if (!url) return '';
    const s = String(url).trim();
    if (!/^(https?:\/\/|mailto:)/i.test(s)) return '';
    return escapeHtml(s);
}

function getLocalDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Точечная замена устаревших времён пар. Раньше replace('13:50','14:00')
// менял любое вхождение (например, в названии аудитории «13:50-а»).
// Теперь заменяем только токен целиком и только в стандартном формате
// "HH:MM" или "HH:MM - HH:MM".
const _TIME_FIX_MAP = { '13:50': '14:00', '15:20': '15:30' };

function _fixTimeToken(t) {
    return _TIME_FIX_MAP[t] || t;
}

function fixTime(str) {
    if (!str) return '';
    const s = String(str).trim();

    const range = s.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (range) {
        return `${_fixTimeToken(range[1])} - ${_fixTimeToken(range[2])}`;
    }

    const single = s.match(/^(\d{1,2}:\d{2})$/);
    if (single) return _fixTimeToken(single[1]);

    return str;
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

// ============================================================
//  КОРПУСА (для карточек друзей)
// ============================================================

const campusNames = { 'galosha': 'Галоша', 'gogol': 'Гоголя', 'univer': 'Университетская' };

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

// ============================================================
//  ПОДСВЕТКА СОВПАДЕНИЙ (автокомплит)
// ============================================================

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
    let s = (parts[0] || '').trim().split(':');
    let e = (parts[1] || '').trim().split(':');
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

;
// --- ui.js ---
// Лоадер, уведомления, сворачивание виджетов, undo-полоса.

const loadingPhrases = [
    "Грызем гранит науки...",
    "Связываемся с деканатом...",
    "Ищем расписание...",
    "Раскладываем пары по полочкам...",
    "Будим преподавателей...",
    "Проверяем наличие окон...",
    "Пинаем сервер...",
    "Сканируем мудл...",
    "Переписываем программу...",
    "Пьем чай...",
    "Слушаем лекцию...",
    "Взламываем калькулятор..."
];

function _ensureLoaderEl() {
    let loader = document.getElementById('globalLoader');
    if (loader) return loader;
    loader = document.createElement('div');
    loader.id = 'globalLoader';
    loader.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
        'background:rgba(255,255,255,0.85)', 'z-index:9999',
        'display:none', 'flex-direction:column',
        'justify-content:center', 'align-items:center',
        'backdrop-filter:blur(4px)'
    ].join(';');
    document.body.appendChild(loader);
    return loader;
}

function _ensureLoaderText(loader) {
    let textEl = document.getElementById('loaderText');
    if (!textEl) {
        textEl = document.createElement('div');
        textEl.id = 'loaderText';
        textEl.className = 'mt-3 fw-bold text-secondary fs-5';
        textEl.textContent = 'Загрузка...';
        loader.appendChild(textEl);
    }
    return textEl;
}

function showGlobalLoader(message) {
    const loader = _ensureLoaderEl();
    const textEl = _ensureLoaderText(loader);
    if (loaderInterval) { clearInterval(loaderInterval); loaderInterval = null; }

    if (message) {
        textEl.textContent = message;
    } else {
        let idx = 0;
        textEl.textContent = loadingPhrases[idx];
        loaderInterval = setInterval(() => {
            idx = (idx + 1) % loadingPhrases.length;
            textEl.textContent = loadingPhrases[idx];
        }, 3000);
    }

    loader.style.display = 'flex';
    void loader.offsetHeight;
}

function hideGlobalLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.style.display = 'none';
    if (loaderInterval) { clearInterval(loaderInterval); loaderInterval = null; }
}

function setLoaderText(message) {
    if (!message) return;
    const textEl = document.getElementById('loaderText');
    if (textEl) textEl.textContent = message;
}

function showUpdateNotification(message) {
    let notif = document.getElementById('updateNotification');
    if (!notif) return;
    document.getElementById('updateNotificationText').textContent = message;
    notif.style.display = 'block';
    notif.animate([
        {opacity: 0, transform: 'translateY(20px)'},
        {opacity: 1, transform: 'translateY(0)'}
    ], {duration: 300, fill: 'forwards'});
    setTimeout(() => {
        let anim = notif.animate([
            {opacity: 1, transform: 'translateY(0)'},
            {opacity: 0, transform: 'translateY(20px)'}
        ], {duration: 300, fill: 'forwards'});
        anim.onfinish = () => notif.style.display = 'none';
    }, 3000);
}

// ============================================================
//  СВОРАЧИВАНИЕ ВИДЖЕТОВ — БЕЗ ЗАЛИПАНИЯ И ПРОПАДАНИЯ ЧАРТОВ
// ------------------------------------------------------------
//  Проблема была в том, что при быстром toggle Chart.js ловил
//  resize в момент, когда контейнер только начал меняться,
//  и «залипал» в промежуточной геометрии. Уничтожение чартов
//  при сворачивании тоже плохо — canvas остаётся с нулевой
//  высотой, и при следующем renderCharts() он не восстанавливается.
//
//  Правильный подход:
//    1) На время CSS-перехода отключаем у чартов авто-ресайз
//       (options.responsive = false) — Chart.js не дёргается.
//    2) После завершения перехода (330 мс) возвращаем responsive = true
//       и зовём chart.resize(). Это даёт чистую геометрию.
//    3) Чарты НЕ уничтожаем — они переживают сворачивание.
// ============================================================

const _widgetResizeTimers = {};

function _getCharts() {
    const list = [];
    if (typeof globalChart    !== 'undefined' && globalChart)    list.push(globalChart);
    if (typeof globalLabChart !== 'undefined' && globalLabChart) list.push(globalLabChart);
    return list;
}

function toggleWidget(bodyId, btn) {
    let body = document.getElementById(bodyId);
    if (!body) return;

    // Отменяем предыдущий отложенный resize (если юзер быстро кликает)
    if (_widgetResizeTimers[bodyId]) {
        clearTimeout(_widgetResizeTimers[bodyId]);
        delete _widgetResizeTimers[bodyId];
    }

    // Замораживаем Chart.js на время анимации
    _getCharts().forEach(ch => {
        if (ch.options) ch.options.responsive = false;
    });

    if (body.style.height === '0px') {
        // --- РАЗВОРАЧИВАНИЕ ---
        body.style.height = body.dataset.originalHeight || (bodyId === 'labPacingBody' ? 'auto' : '160px');
        setTimeout(() => { body.style.overflow = 'visible'; }, 300);
        btn.textContent = '−';
        localStorage.setItem('widget_' + bodyId, 'expanded');
    } else {
        // --- СВОРАЧИВАНИЕ ---
        if (!body.dataset.originalHeight) {
            let h = body.style.height;
            if (!h || h === 'auto') h = window.getComputedStyle(body).height;
            body.dataset.originalHeight = h;
        }
        body.style.overflow = 'hidden';
        body.style.height = '0px';
        btn.textContent = '+';
        localStorage.setItem('widget_' + bodyId, 'collapsed');
    }

    // После завершения CSS-перехода (0.3s) — размораживаем и ресайзим.
    _widgetResizeTimers[bodyId] = setTimeout(() => {
        delete _widgetResizeTimers[bodyId];
        _getCharts().forEach(ch => {
            if (ch.options) ch.options.responsive = true;
            try { ch.resize(); } catch (e) {}
        });
    }, 330);
}

// ============================================================
//  UNDO-ПОЛОСА
// ============================================================

function showUndoBar(message, onUndo) {
    let bar = document.getElementById('undoBar');
    if (!bar) return;

    const textEl = document.getElementById('undoBarText');
    const btnEl  = document.getElementById('undoBarBtn');
    if (textEl) textEl.textContent = message;

    if (btnEl) {
        const newBtn = btnEl.cloneNode(true);
        btnEl.parentNode.replaceChild(newBtn, btnEl);
        newBtn.onclick = () => { if (typeof onUndo === 'function') onUndo(); };
    }

    bar.style.display = 'block';
    bar.animate([
        {opacity: 0, transform: 'translate(-50%, 20px)'},
        {opacity: 1, transform: 'translate(-50%, 0)'}
    ], {duration: 250, fill: 'forwards'});
}

function hideUndoBar() {
    const bar = document.getElementById('undoBar');
    if (!bar || bar.style.display === 'none') return;
    const anim = bar.animate([
        {opacity: 1, transform: 'translate(-50%, 0)'},
        {opacity: 0, transform: 'translate(-50%, 20px)'}
    ], {duration: 200, fill: 'forwards'});
    anim.onfinish = () => { bar.style.display = 'none'; };
}

// ============================================================
//  Вращение ёжика при скролле
// ============================================================
let ezhScrollTimer = null;
let currentEzhRotation = 0;
let lastScrollY = window.scrollY;

window.addEventListener('scroll', () => {
    const ezh = document.getElementById('ezh-logo');
    if (ezh) {
        let delta = window.scrollY - lastScrollY;
        lastScrollY = window.scrollY;
        currentEzhRotation += delta;

        ezh.style.transition = 'transform 0.1s linear';
        ezh.style.transform = `rotate(${currentEzhRotation}deg) scale(0.7)`;

        clearTimeout(ezhScrollTimer);
        ezhScrollTimer = setTimeout(() => {
            currentEzhRotation = Math.round(currentEzhRotation / 360) * 360;
            ezh.style.transition = 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            ezh.style.transform = `rotate(${currentEzhRotation}deg) scale(1)`;
        }, 150);
    }
}, { passive: true });

;
// --- api.js ---
// Обёртки над fetch. Все запросы автоматически проверяют на ошибки HTTP.
// API_BASE подставляется из index.html: пустая строка (Flask) или
// 'http://127.0.0.1:5000' (WebViewAssetLoader на Android).
//
// Таймаут: 30 секунд. Без него зависший бэкенд/СевГУ держит UI на
// лоадере до TCP-таймаута ОС (минуты).

const _API_BASE = (typeof window.API_BASE === 'string') ? window.API_BASE : '';
function _api(path) { return _API_BASE + path; }

const API_TIMEOUT_MS = 30000;

async function _fetchWithTimeout(url, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    try {
        return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    } catch (e) {
        if (e && (e.name === 'AbortError' || e.code === 20)) {
            throw new Error('timeout');
        }
        throw e;
    } finally {
        clearTimeout(t);
    }
}

async function apiGet(url) {
    const r = await _fetchWithTimeout(_api(url));
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
}

async function apiPost(url, body) {
    const r = await _fetchWithTimeout(_api(url), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
}

async function apiPut(url, body) {
    const r = await _fetchWithTimeout(_api(url), {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
}

async function apiDelete(url) {
    const r = await _fetchWithTimeout(_api(url), { method: 'DELETE' });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
}

async function apiLoadGroups()            { return apiGet('/api/groups'); }
async function apiAddCustomGroup(name)    { return apiPost('/api/groups/custom', {name}); }
async function apiLoadSchedule(group, sg) { return apiGet(`/api/schedule_all?group=${encodeURIComponent(group)}&subgroup=${sg}`); }
async function _fetchScheduleResult(url) {
    const r = await _fetchWithTimeout(_api(url));
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    const items = await r.json();
    return {items, exhausted: r.headers.get('X-Schedule-Exhausted') === '1'};
}
async function apiSyncSchedule(group, sg) { return _fetchScheduleResult(`/api/schedule_sync?group=${encodeURIComponent(group)}&subgroup=${sg}`); }
async function apiLoadLabs(group)         { return apiGet(`/api/labs?group=${encodeURIComponent(group)}`); }
async function apiSaveLabs(items)         { return apiPost('/api/labs', items); }
async function apiLoadTasks(start, end)   { return apiGet(`/api/tasks?start=${start}&end=${end}`); }
async function apiCreateTask(t)           { return apiPost('/api/tasks', t); }
async function apiUpdateTask(id, t)       { return apiPut(`/api/tasks/${id}`, t); }
async function apiDeleteTask(id)          { return apiDelete(`/api/tasks/${id}`); }
async function apiLoadTaskDates()         { return apiGet('/api/task_dates'); }
async function apiLoadFriends()           { return apiGet('/api/friends'); }
async function apiCreateFriend(f)         { return apiPost('/api/friends', f); }
async function apiUpdateFriend(id, f)     { return apiPut(`/api/friends/${id}`, f); }
async function apiDeleteFriend(id)        { return apiDelete(`/api/friends/${id}`); }
async function apiLoadSubjects()          { return apiGet('/api/subjects'); }
async function apiSaveSubject(s)          { return apiPost('/api/subjects', s); }
async function apiLoadCustomSchedule(g)   { return apiGet(`/api/custom_schedule?group=${encodeURIComponent(g)}`); }
async function apiCreateCustomSchedule(x) { return apiPost('/api/custom_schedule', x); }
async function apiUpdateCustomSchedule(id, x) { return apiPut(`/api/custom_schedule/${id}`, x); }
async function apiDeleteCustomSchedule(id)    { return apiDelete(`/api/custom_schedule/${id}`); }
async function apiSearch(q)                   { return apiGet(`/api/search?q=${encodeURIComponent(q)}`); }
async function apiSyncScheduleForce(group, sg){ return _fetchScheduleResult(`/api/schedule_sync?group=${encodeURIComponent(group)}&subgroup=${sg}&force=1`); }

async function apiLoadLabItems(group)               { return apiGet(`/api/lab_items?group=${encodeURIComponent(group)}`); }
async function apiSyncLabItems(group, items)        { return apiPost('/api/lab_items/sync', {group, items}); }
async function apiUpdateLabItem(id, patch)          { return apiPut(`/api/lab_items/${id}`, patch); }
async function apiAddLabItem(group, subject)        { return apiPost('/api/lab_items/add', {group, subject}); }
async function apiRemoveLastLabItem(group, subject) { return apiPost('/api/lab_items/remove_last', {group, subject}); }

;
// --- weeks.js ---
// Навигация по неделям + сброс вертикального дня при смене недели.

// ------------------------------------------------------------
//  ЯКОРЬ ЧЁТНОСТИ НЕДЕЛИ
// ------------------------------------------------------------
//  Чётность считается от этой даты: целое число недель от якоря
//  до текущего понедельника → чётное = «Ч», нечётное = «НЧ».
//
//  Якорь привязан к понедельнику 6 января 2020. Значение выбрано
//  так, чтобы неделя 06.01.2020–12.01.2020 была «чётной» — но
//  проверить по реальному учебному графику СевГУ в коде невозможно.
//
//  ВАЖНО: если вуз считает чётность иначе, все бейджи «Ч/НЧ»
//  будут инвертированы. Проверить можно так:
//    1) Открыть расписание СевГУ для своей группы.
//    2) Взять дату понедельника любой недели, где явно видно
//       «чётная»/«нечётная» на сайте расписания.
//    3) Посчитать: Math.floor((дата - anchor) / 7дней) % 2.
//    4) Если не совпадает — сдвинуть якорь на 7 дней вперёд/назад.
//
//  Альтернатива (более надёжная, но требует данных): брать
//  чётность из поля `week`/`parity` в ответе API СевГУ. В текущем
//  v6.2 такого поля нет, поэтому остаётся локальный якорь.
const _WEEK_PARITY_ANCHOR_MS = Date.UTC(2020, 0, 6);

// Слушатель shown.bs.dropdown вешается один раз на кнопку, а не на каждый
// updateWeekDropdown — иначе при многократной навигации они копятся.
let _weekDropdownScrollBound = false;

function _weekParityLabel(weekDate) {
    const d = new Date(Date.UTC(weekDate.getFullYear(), weekDate.getMonth(), weekDate.getDate()));
    const days = Math.floor((d - _WEEK_PARITY_ANCHOR_MS) / 86400000);
    const weeks = Math.floor(days / 7);

    return (weeks % 2 === 0)
        ? { label: 'Ч',  cls: 'week-even', title: 'Чётная неделя' }
        : { label: 'НЧ', cls: 'week-odd',  title: 'Нечётная неделя' };
}

function updateWeekDropdown() {
    let menu = document.getElementById("weekDropdownMenu");
    let btn = document.getElementById("weekDropdownBtn");
    if (!menu || !btn) return;
    menu.innerHTML = "";

    let realBase = new Date();
    realBase.setDate(realBase.getDate() - (realBase.getDay() === 0 ? 6 : realBase.getDay() - 1));
    realBase.setHours(0, 0, 0, 0);

    let currBase = new Date(currentBaseDate);
    currBase.setHours(0, 0, 0, 0);
    let currentOffset = Math.round((currBase - realBase) / (7 * 24 * 60 * 60 * 1000));

    for (let i = -20; i <= 20; i++) {
        let d = new Date(realBase);
        d.setDate(d.getDate() + (i * 7));
        let endD = new Date(d);
        endD.setDate(endD.getDate() + 6);
        let label = `${d.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})} - ${endD.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})}`;
        if (i === 0) label = `🏠 Текущая: ${label}`;

        const parity = _weekParityLabel(d);

        let li = document.createElement('li');
        let a = document.createElement('a');
        a.className = 'dropdown-item week-item' + (i === currentOffset ? ' active' : '');
        a.href = '#';
        a.title = parity.title;
        a.innerHTML = `<span class="week-item-label">${label}</span>
                       <span class="week-badge ${parity.cls}">${parity.label}</span>`;
        a.onclick = (e) => { e.preventDefault(); jumpToWeek(i); };
        li.appendChild(a);
        menu.appendChild(li);
    }

    let dBtn = new Date(realBase);
    dBtn.setDate(dBtn.getDate() + (currentOffset * 7));
    let endDBtn = new Date(dBtn);
    endDBtn.setDate(endDBtn.getDate() + 6);
    const btnParity = _weekParityLabel(dBtn);
    btn.innerHTML = `📅 ${dBtn.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})} - ${endDBtn.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})} <span class="week-badge ${btnParity.cls}">${btnParity.label}</span>`;

    if (!_weekDropdownScrollBound) {
        _weekDropdownScrollBound = true;
        btn.addEventListener('shown.bs.dropdown', () => {
            setTimeout(() => {
                let active = menu.querySelector('.dropdown-item.active');
                if (active) active.scrollIntoView({ block: 'center' });
            }, 30);
        });
    }
}

function jumpToWeek(offsetVal) {
    let realBase = new Date();
    realBase.setDate(realBase.getDate() - (realBase.getDay() === 0 ? 6 : realBase.getDay() - 1));
    currentBaseDate = new Date(realBase);
    currentBaseDate.setDate(currentBaseDate.getDate() + (parseInt(offsetVal) * 7));
    // Раньше тут был expandedDayDateStr = getLocalDateStr(currentBaseDate),
    // но при этом колонка визуально не разворачивалась — стрелки ←/→
    // начинали листать дни вместо недель. Теперь просто сбрасываем.
    expandedDayDateStr = null;
    if (typeof _verticalDayOffset !== 'undefined') _verticalDayOffset = null;
    renderCalendar();
    if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();
}

function goToToday() {
    let realTodayStr = getLocalDateStr(new Date());
    currentBaseDate = new Date();
    currentBaseDate.setDate(currentBaseDate.getDate() - (currentBaseDate.getDay() === 0 ? 6 : currentBaseDate.getDay() - 1));
    // См. комментарий в jumpToWeek — не оставляем стрелки в дневном режиме.
    expandedDayDateStr = null;
    if (typeof _verticalDayOffset !== 'undefined') _verticalDayOffset = null;
    renderCalendar();
    if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();
}

function changeWeek(offset) {
    window._calDir = offset > 0 ? 'right' : 'left';
    currentBaseDate.setDate(currentBaseDate.getDate() + (offset * 7));
    // Если день был развёрнут на всю ширину — сбрасываем, иначе
    // navigatePrev/Next уедут в дневной режим, а на экране — неделя.
    expandedDayDateStr = null;
    if (typeof _verticalDayOffset !== 'undefined') _verticalDayOffset = null;
    renderCalendar();
    if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();
}

;
// --- mini-calendar.js ---
// Мини-календарь в сайдбаре.
// Месяц всегда синхронизирован с текущей неделей основной сетки.
// Кнопки ‹ ● › листают основную сетку (на ±4 недели / к сегодня).

const MINI_CAL_WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MINI_CAL_MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

function renderMiniCalendar() {
    const container = document.getElementById('miniCalendarBody');
    if (!container) return;

    // Месяц = месяц понедельника текущей недели
    const base = new Date(currentBaseDate);
    const year  = base.getFullYear();
    const month = base.getMonth();

    const titleEl = document.getElementById('miniCalendarTitle');
    if (titleEl) titleEl.textContent = `${MINI_CAL_MONTHS[month]} ${year}`;

    const datesWithTasks = (typeof taskDatesSet !== 'undefined') ? taskDatesSet : new Set();

    const datesWithSchedule = new Set();
    if (Array.isArray(cachedSchedule)) {
        cachedSchedule.forEach(item => {
            if (item.date) datesWithSchedule.add(item.date);
        });
    }

    const datesWithCustom = new Set();
    if (typeof customScheduleItems !== 'undefined' && Array.isArray(customScheduleItems) && customScheduleItems.length > 0) {
        const firstOfMonth = new Date(year, month, 1);
        const lastOfMonth  = new Date(year, month + 1, 0);
        for (let d = new Date(firstOfMonth); d <= lastOfMonth; d.setDate(d.getDate() + 1)) {
            const ds = getLocalDateStr(d);
            try {
                const items = getCustomItemsForDate(ds);
                if (items && items.length > 0) datesWithCustom.add(ds);
            } catch (e) { /* ignore */ }
        }
    }

    const firstDay = new Date(year, month, 1);
    let firstDow = firstDay.getDay();
    if (firstDow === 0) firstDow = 7;
    firstDow -= 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = getLocalDateStr(new Date());

    const currentWeekStart = new Date(currentBaseDate);
    currentWeekStart.setHours(0, 0, 0, 0);
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);

    let html = '<div class="mini-cal-grid">';
    MINI_CAL_WEEKDAYS.forEach(w => {
        html += `<div class="mini-cal-weekday">${w}</div>`;
    });

    for (let i = 0; i < firstDow; i++) {
        html += '<div class="mini-cal-day mini-cal-empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = getLocalDateStr(date);

        const classes = ['mini-cal-day'];
        if (dateStr === todayStr) classes.push('mini-cal-today');
        if (date >= currentWeekStart && date <= currentWeekEnd) classes.push('mini-cal-current-week');

        let dots = '';
        if (datesWithTasks.has(dateStr))    dots += '<span class="mini-cal-dot mini-cal-dot-task" title="Есть заметки"></span>';
        if (datesWithSchedule.has(dateStr)) dots += '<span class="mini-cal-dot mini-cal-dot-class" title="Есть пары"></span>';
        if (datesWithCustom.has(dateStr))   dots += '<span class="mini-cal-dot mini-cal-dot-event" title="Есть события"></span>';

        html += `<div class="${classes.join(' ')}" onclick="miniCalPickDate('${dateStr}')" title="${dateStr}">
            <span class="mini-cal-num">${d}</span>
            <span class="mini-cal-dots">${dots}</span>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

// Кнопки мини-календаря листают основную сетку.
function miniCalPrevMonth() { changeWeek(-4); }
function miniCalNextMonth() { changeWeek(4);  }
function miniCalToday()     { goToToday();    }

function miniCalPickDate(dateStr) {
    if (typeof jumpToDate === 'function') {
        jumpToDate(dateStr);
    }
}

function refreshMiniCalendar() {
    renderMiniCalendar();
}

;
// --- calendar-cards.js ---
// Карточки внутри дня: события и пары, плюс раскладка «+ Заметка».
// Работает в паре с calendar.js (оркестратор) и calendar-day.js (взаимодействие).

function _layoutScheduleNotes(rootEl) {
    const scope = rootEl || document;
    scope.querySelectorAll('.schedule-item').forEach(card => {
        const top    = card.querySelector('.schedule-item-top');
        const footer = card.querySelector('.schedule-item-footer');
        if (!top || !footer) return;

        let note = top.querySelector('.add-task-btn') || footer.querySelector('.add-task-btn');
        if (!note) return;

        if (note.parentElement !== top) top.appendChild(note);

        const timeEl = top.querySelector('.schedule-item-time');
        if (!timeEl) return;

        const timeTop = timeEl.getBoundingClientRect().top;
        const noteTop = note.getBoundingClientRect().top;

        if (noteTop > timeTop + 4) {
            footer.appendChild(note);
        }
    });
}

// ============================================================
//  КАРТОЧКА СОБЫТИЯ
// ============================================================

function _renderEventCard(ev) {
    const safeSubject = escapeJsString(ev.lesson || '');

    const teacherHtml = (ev.teacher && showTeacher)
        ? `<div class="schedule-item-teacher">${escapeHtml(ev.teacher)}</div>` : '';
    const locationHtml = (ev.location && showLocation)
        ? `<div class="schedule-item-location">${escapeHtml(ev.location)}</div>` : '';

    return `
        <div class="schedule-item event-card shadow-sm"
             style="border-left: 3px solid var(--event-color);">
            <div class="schedule-item-top">
                <span class="schedule-item-time">
                    <strong class="text-primary">${escapeHtml(ev.time_range)}</strong>
                    <span class="schedule-item-edit"
                          onclick="openCustomScheduleModal('${ev.date}', ${ev.custom_id})"
                          title="Редактировать">✏️</span>
                </span>
                <span class="add-task-btn"
                      onclick="createTaskFromSchedule('${ev.date}', '${safeSubject}')">+ Заметка</span>
            </div>
            <div class="schedule-item-badge">
                <span class="badge bg-success" style="font-size: 0.7em;">Событие</span>
            </div>
            <div class="schedule-item-title">${escapeHtml(ev.lesson)}</div>
            ${teacherHtml}
            ${locationHtml}
            <div class="schedule-item-footer"></div>
        </div>
    `;
}

// ============================================================
//  КАРТОЧКА ПАРЫ
// ============================================================

function _renderPairCard(item) {
    const origLesson = item.lesson;
    const subjectKey = item.is_custom ? origLesson : `${item.lesson} (${item.type_name})`;
    const safeSubjectKey = escapeJsString(subjectKey);

    let displayLesson = origLesson;
    let lessonLink = "";
    let displayTeacher = item.teacher || "";
    let displayLocation = item.location || "";
    let customName = '';

    if (!item.is_custom && cachedSubjectSettings[subjectKey]) {
        const s = cachedSubjectSettings[subjectKey];
        if (s.custom_name) { customName = s.custom_name; displayLesson = customName; }
        if (s.link)        lessonLink = s.link;
        if (s.teacher)     displayTeacher = s.teacher;
        if (s.location)    displayLocation = s.location;
    }

    let taskSubjectLabel;
    if (item.is_custom) taskSubjectLabel = item.lesson;
    else if (customName) taskSubjectLabel = `${customName} (${item.type_name})`;
    else taskSubjectLabel = subjectKey;
    const safeTaskSubject = escapeJsString(taskSubjectLabel);

    // ВАЖНО: safeHref возвращает уже экранированную строку и отсекает
    // не-http(s)/mailto схемы. Раньше сюда попадал сырой s.link —
    // и кавычка в ссылке ломала атрибут → XSS.
    const href = safeHref(lessonLink);
    let lessonHtml = href
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-decoration-none fw-bold" style="color: var(--accent);" title="${escapeHtml(origLesson)}">${escapeHtml(displayLesson)}</a>`
        : `<span title="${escapeHtml(origLesson)}">${escapeHtml(displayLesson)}</span>`;

    if (!item.is_custom) {
        lessonHtml += ` <span style="cursor:pointer; font-size: 0.9em; opacity: 0.4;" onclick="openSubjectSettings('${safeSubjectKey}')" title="Настроить предмет">⚙️</span>`;
    }

    let typeBadge = '';
    if (item.is_custom && item.is_event) {
        typeBadge = `<span class="badge bg-success" style="font-size: 0.7em;">Событие</span>`;
    } else if (item.type_name) {
        typeBadge = `<span class="badge bg-secondary" style="font-size: 0.7em;">${escapeHtml(item.type_name)}</span>`;
    }

    let editIconHtml = item.is_custom
        ? `<span class="schedule-item-edit"
                onclick="openCustomScheduleModal('${item.date}', ${item.custom_id})"
                title="Редактировать">✏️</span>`
        : '';

    const teacherHtml = (displayTeacher && showTeacher)
        ? `<div class="schedule-item-teacher">${escapeHtml(displayTeacher)}</div>` : '';
    const locationHtml = (displayLocation && showLocation)
        ? `<div class="schedule-item-location">${escapeHtml(displayLocation)}</div>` : '';

    const customStyle = item.is_custom
        ? (item.is_event ? 'border-left: 3px solid var(--event-color);' : 'border-left: 3px solid var(--custom-pair-color);')
        : 'border-left: 3px solid var(--accent);';

    return `
        <div class="schedule-item shadow-sm" style="${customStyle}">
            <div class="schedule-item-top">
                <span class="schedule-item-time">
                    <strong class="text-primary">${escapeHtml(item.time_range)}</strong>
                    ${editIconHtml}
                </span>
                <span class="add-task-btn" onclick="createTaskFromSchedule('${item.date}', '${safeTaskSubject}')">+ Заметка</span>
            </div>
            ${typeBadge ? `<div class="schedule-item-badge">${typeBadge}</div>` : ''}
            <div class="schedule-item-title">${lessonHtml}</div>
            ${teacherHtml}
            ${locationHtml}
            <div class="schedule-item-footer"></div>
        </div>
    `;
}

;
// --- calendar-day.js ---
// Взаимодействие с днём: раскрыть/свернуть пары, развернуть день,
// перебалансировать длинный текст заметок.
// Работает в паре с calendar.js и calendar-cards.js.

// ============================================================
//  РАСКРЫТИЕ СПИСКА ПАР В КОЛОНКЕ
// ============================================================

function toggleSchedule(dateStr) {
    let details = document.getElementById(`schedule-details-${dateStr}`);
    let arrow = document.getElementById(`arrow-${dateStr}`);
    if (!details) return;
    const nowExpanded = details.classList.toggle('expanded');
    if (arrow) arrow.textContent = nowExpanded ? '▲' : '▼';

    // Пересчёт раскладки «+ Заметка» при развороте
    _layoutScheduleNotes();
}

// ============================================================
//  РАЗВОРОТ ДНЯ НА ВСЮ ШИРИНУ
// ============================================================

function toggleExpandDay(dateStr) {
    // Раньше здесь был document.querySelector('.calendar-grid'), но
    // рядом могут жить гриды друзей/преподавателей — берём строго
    // главный календарь по id.
    let grid = document.getElementById('calendar');
    let col  = document.getElementById(`day-col-${dateStr}`);
    let btn  = document.querySelector(`#expand-btn-wrap-${dateStr} .day-expand-btn`);
    let headerEl = document.querySelector('.controls-header');
    let headerOffset = headerEl ? headerEl.offsetHeight + 25 : 90;

    if (!col) return;

    function scrollToCol(alignTop) {
        let rect = col.getBoundingClientRect();
        let targetY = window.pageYOffset + rect.top - (alignTop ? headerOffset : 0);
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    }

    if (col.classList.contains('fullscreen-day')) {
        col.classList.remove('fullscreen-day');
        if (grid) grid.classList.remove('has-fullscreen');
        if (btn) {
            btn.classList.remove('is-expanded');
            let lbl = btn.querySelector('.day-expand-label');
            if (lbl) lbl.textContent = 'Развернуть';
        }
        expandedDayDateStr = null;
        let details = document.getElementById(`schedule-details-${dateStr}`);
        let arrow   = document.getElementById(`arrow-${dateStr}`);
        if (details) details.classList.remove('expanded');
        if (arrow)   arrow.textContent = "▼";
        rebalanceDayText(dateStr);
        _layoutScheduleNotes();
    } else {
        col.classList.add('fullscreen-day');
        if (grid) grid.classList.add('has-fullscreen');
        if (btn) {
            btn.classList.add('is-expanded');
            let lbl = btn.querySelector('.day-expand-label');
            if (lbl) lbl.textContent = 'Свернуть';
        }
        expandedDayDateStr = dateStr;
        let details = document.getElementById(`schedule-details-${dateStr}`);
        let arrow   = document.getElementById(`arrow-${dateStr}`);
        if (details) details.classList.add('expanded');
        if (arrow) arrow.textContent = "▲";
        setTimeout(() => {
            scrollToCol(true);
            _layoutScheduleNotes();
        }, 60);
    }
}

// ============================================================
//  БАЛАНСИРОВКА ТЕКСТА ЗАМЕТОК В КОЛОНКЕ
// ------------------------------------------------------------
//  Если заметки не помещаются — режем их до N символов и
//  показываем кнопку «Развернуть». В fullscreen-режиме
//  показывает полный текст.
// ============================================================

function rebalanceDayText(dateStr) {
    let container = document.getElementById(`tasks-${dateStr}`);
    if (!container) return;
    let cards = Array.from(container.querySelectorAll('.task-card'));
    let wrap  = document.getElementById(`expand-btn-wrap-${dateStr}`);
    let col   = document.getElementById(`day-col-${dateStr}`);
    let isExpanded = col && col.classList.contains('fullscreen-day');

    if (cards.length === 0) {
        if (wrap) wrap.style.display = isExpanded ? 'block' : 'none';
        return;
    }

    let lengths = cards.map(card => {
        let fullEl = card.querySelector('.task-text-full');
        return fullEl ? fullEl.textContent.length : 0;
    });
    let totalLen = lengths.reduce((s, n) => s + n, 0);

    const SHOW_BTN_THRESHOLD = 50;
    let showButton = totalLen > SHOW_BTN_THRESHOLD || isExpanded;
    if (wrap) wrap.style.display = showButton ? 'block' : 'none';

    const SINGLE_NOTE_LIMIT = 50;
    const MULTI_TOTAL_LIMIT = 80;
    let shouldTrim = cards.length === 1 ? lengths[0] > SINGLE_NOTE_LIMIT : totalLen > MULTI_TOTAL_LIMIT;

    if (!shouldTrim) {
        cards.forEach(card => {
            let shortEl = card.querySelector('.task-text-short');
            let fullEl  = card.querySelector('.task-text-full');
            if (shortEl && fullEl) { shortEl.textContent = fullEl.textContent; shortEl.style.opacity = ''; }
        });
        return;
    }

    if (cards.length === 1) {
        let shortEl = cards[0].querySelector('.task-text-short');
        let fullEl  = cards[0].querySelector('.task-text-full');
        if (shortEl && fullEl) shortEl.textContent = fullEl.textContent.slice(0, SINGLE_NOTE_LIMIT).trimEnd() + '…';
        return;
    }

    const TOTAL_BUDGET = MULTI_TOTAL_LIMIT;
    let share = Math.floor(TOTAL_BUDGET / cards.length);
    let remainder = TOTAL_BUDGET - share * cards.length;

    cards.forEach((card, idx) => {
        let shortEl = card.querySelector('.task-text-short');
        let fullEl  = card.querySelector('.task-text-full');
        if (!shortEl || !fullEl) return;
        let full = fullEl.textContent;
        let limit = share + (idx < remainder ? 1 : 0);
        shortEl.textContent = full.length <= limit ? full : full.slice(0, limit).trimEnd() + '…';
    });
}

// Пересчёт при изменении размера окна — ширина колонок меняется,
// значит «+ Заметка» может помещаться или не помещаться по-новому.
window.addEventListener('resize', () => {
    if (typeof _layoutScheduleNotes === 'function') _layoutScheduleNotes();
});

;
// --- calendar.js ---
function getCustomItemsForDate(dateStr) {
    let items = [];
    let [ty, tm, td] = dateStr.split('-');
    let tDate = new Date(ty, tm - 1, td);
    customScheduleItems.forEach(item => {
        let [by, bm, bd] = item.base_date.split('-');
        let bDate = new Date(by, bm - 1, bd);
        if (tDate < bDate) return;
        let exceptions = [];
        try { exceptions = JSON.parse(item.exceptions || '[]'); } catch (e) {}
        if (exceptions.includes(dateStr)) return;
        let diffDays = Math.round(Math.abs(tDate - bDate) / (1000 * 60 * 60 * 24));
        let match = false;
        if (item.recurrence === 'none' && diffDays === 0) match = true;
        else if (item.recurrence === 'weekly' && diffDays % 7 === 0) match = true;
        else if (item.recurrence === 'biweekly' && diffDays % 14 === 0) match = true;
        if (match) {
            items.push({
                is_custom: true,
                custom_id: item.id,
                base_date: item.base_date,
                recurrence: item.recurrence,
                exceptions: item.exceptions,
                is_event: item.is_event === 1,
                date: dateStr,
                time_range: item.time_range,
                lesson: item.lesson,
                type_name: item.type_name,
                teacher: item.teacher,
                location: item.location
            });
        }
    });
    return items;
}

function _sortItemsByTime(a, b) {
    let aTime = a.time_range ? a.time_range.split(' - ')[0] : "99:99";
    let bTime = b.time_range ? b.time_range.split(' - ')[0] : "99:99";
    return aTime.localeCompare(bTime);
}

async function renderCalendar() {
    const calDir = window._calDir;
    window._calDir = null;

    const cal = document.getElementById("calendar");
    if (!cal) return;
    cal.innerHTML = "";

    let startStr = getLocalDateStr(currentBaseDate);
    let endD = new Date(currentBaseDate);
    endD.setDate(endD.getDate() + 6);
    let endStr = getLocalDateStr(endD);
    let realTodayStr = getLocalDateStr(new Date());
    const currentGroup = (document.getElementById('groupSelect')?.value || '').trim();

    // Направленная анимация
    cal.className = 'calendar-grid flex-grow-1';
    if (calDir === 'right') cal.classList.add('slide-right');
    else if (calDir === 'left') cal.classList.add('slide-left');
    else cal.classList.add('fade-in');

    // Раньше условие было `cachedSchedule.length === 0`, и это прятало
    // кастомные события, даже если они есть. Теперь пропускаем рендер
    // только когда пусто и там, и там.
    const hasCustom = Array.isArray(customScheduleItems) && customScheduleItems.length > 0;
    if (!currentGroup || (cachedSchedule.length === 0 && !hasCustom)) {
        cal.innerHTML = `<div class="empty-state empty-state-wide">
            <div class="empty-state-icon">📚</div>
            <div class="empty-state-title">${currentGroup ? 'Расписание не загружено' : 'Выберите группу'}</div>
        </div>`;
        if (typeof renderSyncFreshness === 'function') renderSyncFreshness();
        return;
    }

    const scheduleByDate = new Map();
    cachedSchedule.forEach(it => {
        if (!scheduleByDate.has(it.date)) scheduleByDate.set(it.date, []);
        scheduleByDate.get(it.date).push(it);
    });

    const htmlParts = [];
    for (let i = 0; i < 7; i++) {
        let d = new Date(currentBaseDate);
        d.setDate(d.getDate() + i);
        let dateStr = getLocalDateStr(d);
        let displayDate = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
        let isTodayClass = (dateStr === realTodayStr) ? "day-today" : "";

        let pairItems = (scheduleByDate.get(dateStr) || []).slice().sort(_sortItemsByTime);
        let customAll = getCustomItemsForDate(dateStr);
        let eventItems = customAll.filter(x => x.is_event);
        let customPairs = customAll.filter(x => !x.is_event);

        let pairsCount = pairItems.length + customPairs.length;
        let eventsCount = eventItems.length;

        let cardsHtml = '';
        let allItems = eventItems.concat(customPairs).concat(pairItems).sort(_sortItemsByTime);
        allItems.forEach(item => {
            if (item.is_event) cardsHtml += _renderEventCard(item);
            else cardsHtml += _renderPairCard(item);
        });

        htmlParts.push(`
            <div class="day-col ${isTodayClass}" id="day-col-${dateStr}">
                <div class="day-header"><span class="day-nav-center">${displayDate}</span></div>

                <div class="day-schedule-wrap mb-2">
                    ${(pairsCount + eventsCount) > 0 ? `
                        <div class="schedule-summary shadow-sm" onclick="toggleSchedule('${dateStr}')">
                            <span>🕒 ${pairsCount} ${plural(pairsCount, 'пара', 'пары', 'пар')}</span>
                            ${eventsCount > 0 ? `<span class="ms-2 text-primary">🎯 ${eventsCount}</span>` : ''}
                            <span id="arrow-${dateStr}" class="ms-2">▼</span>
                        </div>
                        <div id="schedule-details-${dateStr}" class="expanded">
                            <div class="schedule-details-inner">${cardsHtml}</div>
                        </div>
                    ` : `<div class="empty-state-inline">☕ Свободно</div>`}
                    <button type="button" class="btn btn-sm btn-outline-success w-100 mt-1" style="font-size: 11px;" onclick="event.stopPropagation(); openCustomScheduleModal('${dateStr}')">+ Событие</button>
                </div>

                <div class="day-tasks-wrap mt-2">
                    <div id="tasks-${dateStr}" class="mb-1"></div>
                    <div id="expand-btn-wrap-${dateStr}" style="display:none; text-align:center; margin-top:4px;">
                        <button type="button" class="day-expand-btn" onclick="event.stopPropagation(); toggleExpandDay('${dateStr}')">
                            <span class="day-expand-icon">▼</span>
                            <span class="day-expand-label">Развернуть</span>
                        </button>
                    </div>
                    <div id="task-input-wrap-${dateStr}" style="display:none; margin-top:6px;">
                        <textarea id="task-input-${dateStr}" class="form-control form-control-sm" rows="2"
                                  placeholder="Заметка..."
                                  onkeydown="handleNewTask(event, '${dateStr}')"
                                  onblur="handleTaskBlur('${dateStr}')"></textarea>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-primary w-100 mt-1"
                            style="font-size: 11px;"
                            onclick="event.stopPropagation(); toggleTaskInput('${dateStr}')">+ Заметка</button>
                </div>
            </div>`);
    }
    cal.innerHTML = htmlParts.join('');

    // Клик по колонке = развернуть день (десктоп) / открыть вкладку «День» (мобилка).
    // openDayMode сам разбирается с повторным кликом по развёрнутому дню —
    // см. mobile.js.
    cal.querySelectorAll('.day-col').forEach(col => {
        col.addEventListener('click', (e) => {
            if (e.target.closest('button, a, textarea, input, .schedule-item, .schedule-summary')) return;
            const id = col.id;
            if (id && id.startsWith('day-col-')) openDayMode(id.slice('day-col-'.length));
        });
    });

    try {
        let tasks = await apiLoadTasks(startStr, endStr);
        if (typeof renderTasksStaggered === 'function') renderTasksStaggered(tasks);
    } catch (e) { console.error(e); }

    if (typeof _layoutScheduleNotes === 'function') _layoutScheduleNotes();

    if (typeof renderFriendsCalendar === 'function') renderFriendsCalendar(calDir);
    if (typeof renderTeachersCalendars === 'function') renderTeachersCalendars();
    if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
    if (typeof renderSyncFreshness === 'function') renderSyncFreshness();
    if (typeof checkOnboarding === 'function') checkOnboarding();
}

async function renderDayView() {
    const container = document.getElementById('dayViewContent');
    const title = document.getElementById('dayViewTitle');
    if (!container || !window.expandedDayDateStr) return;

    let [y, m, d] = window.expandedDayDateStr.split('-').map(Number);
    let dateObj = new Date(y, m - 1, d);
    title.textContent = dateObj.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

    let pairItems = cachedSchedule.filter(x => x.date === window.expandedDayDateStr).sort(_sortItemsByTime);
    let customAll = getCustomItemsForDate(window.expandedDayDateStr);
    let eventItems = customAll.filter(x => x.is_event);
    let customPairs = customAll.filter(x => !x.is_event);
    let allItems = eventItems.concat(customPairs).concat(pairItems).sort(_sortItemsByTime);

    let dayTasks = [];
    try {
        dayTasks = await apiLoadTasks(window.expandedDayDateStr, window.expandedDayDateStr);
    } catch (e) { console.error("Day tasks load failed", e); }

    let html = '';

    if (allItems.length === 0) {
        html += `<div class="text-center text-muted small mb-3">Пар и событий нет.</div>`;
    } else {
        allItems.forEach(item => {
            let isEvent = item.is_event || (item.is_custom && item.is_event);
            let typeBadge = isEvent ? 'Событие' : (item.type_name || 'Пара');
            let bgColor = isEvent ? 'var(--custom-pair-color)' : (item.is_custom ? 'var(--custom-pair-color)' : 'var(--accent)');
            let editBtn = item.is_custom ? `<button class="btn btn-sm btn-link text-secondary p-0 ms-2" onclick="openCustomScheduleModal('${item.date}', ${item.custom_id})">✏️</button>` : '';

            html += `
                <div class="schedule-item shadow-sm mb-3" style="border-left: 4px solid ${bgColor}; padding: 12px;">
                    <div class="d-flex justify-content-between mb-2">
                        <strong class="text-primary" style="font-size: 1.1rem;">${item.time_range}</strong>
                        <div class="d-flex align-items-center">
                            <span class="badge bg-secondary">${typeBadge}</span>
                            ${editBtn}
                        </div>
                    </div>
                    <div class="fw-bold mb-1" style="font-size: 1.1rem;">${escapeHtml(item.lesson)}</div>
                    ${item.teacher ? `<div class="text-muted small">👤 ${escapeHtml(item.teacher)}</div>` : ''}
                    ${item.location ? `<div class="text-muted small">🚪 ${escapeHtml(item.location)}</div>` : ''}
                </div>`;
        });
    }

    html += `<div class="mt-4 mb-2 fw-bold text-secondary border-bottom pb-1">📝 Заметки на день</div>`;
    if (dayTasks.length === 0) {
        html += `<div class="text-center text-muted small mb-3">Заметок нет.</div>`;
    } else {
        dayTasks.forEach(t => {
            let color = t.status === 'green' ? 'var(--status-green)' : (t.status === 'orange' ? 'var(--status-orange)' : (t.status === 'red' ? 'var(--status-red)' : 'var(--status-completed)'));
            let isDone = t.status === 'completed';
            html += `
                <div class="task-card mb-2 shadow-sm" style="border-left: 4px solid ${color}; ${isDone ? 'opacity:0.6; text-decoration:line-through;' : ''} cursor:pointer;" onclick="if(!${isDone}) toggleColor(${t.id}, '${t.status}')">
                    <div class="task-text" style="font-size: 0.95rem; white-space: pre-wrap;">${escapeHtml(t.text)}</div>
                    <div class="d-flex justify-content-end mt-1 gap-2">
                        ${!isDone ? `<a class="task-btn task-edit text-decoration-none" onclick="event.stopPropagation(); let newText = prompt('Изменить заметку:', '${escapeJsString(t.text)}'); if(newText && newText.trim() !== '') { updateTaskRequest({id: ${t.id}, date: '${t.date}', text: newText.trim(), status: '${t.status}'}); renderDayView(); }">✏️</a>` : ''}
                        <a class="task-btn text-decoration-none" onclick="event.stopPropagation(); handleTaskDeleteClick({id: ${t.id}, date: '${t.date}', text: '${escapeJsString(t.text)}', status: '${t.status}'}); setTimeout(renderDayView, 300);">${isDone ? '🗑️' : '×'}</a>
                    </div>
                </div>
            `;
        });
    }

    html += `
        <div class="mt-4 p-3 bg-light rounded border">
            <div class="fw-bold mb-2 small text-secondary">ДОБАВИТЬ НА ЭТОТ ДЕНЬ</div>
            <textarea id="dayViewNewNote" class="form-control form-control-sm mb-2" rows="2" placeholder="Текст заметки..."></textarea>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-primary flex-fill" onclick="createDayViewTask('${window.expandedDayDateStr}')">+ Заметка</button>
                <button class="btn btn-sm btn-outline-success flex-fill" onclick="openCustomScheduleModal('${window.expandedDayDateStr}')">+ Событие</button>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

async function createDayViewTask(dateStr) {
    const textarea = document.getElementById('dayViewNewNote');
    const text = textarea.value.trim();
    if (!text) return;

    textarea.value = '';
    try {
        let data = await apiCreateTask({date: dateStr, text: text, status: 'green'});
        taskDatesSet.add(dateStr);
        if (typeof refreshMiniCalEvents === 'function') refreshMiniCalEvents();
        if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();
        await renderDayView();
    } catch (e) {
        alert("Не удалось создать заметку");
        console.error(e);
    }
}

function navigateDay(offset) {
    if (!window.expandedDayDateStr) return;
    let [y, m, d] = window.expandedDayDateStr.split('-').map(Number);
    let target = new Date(y, m - 1, d);
    target.setDate(target.getDate() + offset);
    window.expandedDayDateStr = getLocalDateStr(target);
    renderDayView();
}

// ============================================================
//  ИНДИКАТОР СВЕЖЕСТИ РАСПИСАНИЯ
// ============================================================

function _formatAgo(ms) {
    const diff = Date.now() - ms;
    if (diff < 60 * 1000) return 'только что';
    const min = Math.floor(diff / 60000);
    if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')} назад`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
    return 'давно';
}

function renderSyncFreshness() {
    const el = document.getElementById('syncFreshness');
    if (!el) return;

    const group    = (document.getElementById('groupSelect')?.value || '').trim();
    const subgroup = document.getElementById('subgroupSelect')?.value || '0';
    if (!group) { el.textContent = ''; return; }

    const ts = (typeof getSyncTime === 'function') ? getSyncTime(group, subgroup) : null;
    if (!ts) {
        el.innerHTML = `<span class="sync-fresh sync-fresh-cache" title="Расписание загружено из локального кэша">📦 из кэша</span>`;
        return;
    }

    const age = Date.now() - ts;
    const isFresh = age < 6 * 60 * 60 * 1000;
    const cls = isFresh ? 'sync-fresh-ok' : 'sync-fresh-cache';
    const icon = isFresh ? '🔄' : '📦';
    const hint = isFresh ? 'Синхронизировано недавно' : 'Давно не синхронизировано';

    el.innerHTML = `<span class="sync-fresh ${cls}" title="${hint}">${icon} ${_formatAgo(ts)}</span>`;
}

;
// --- navigation.js ---
// Навигация по календарю: заметки, события, стрелки.

function computeNextNoteDate(currentDateStr) {
    let sorted = [...taskDatesSet].sort();
    return sorted.find(d => d > currentDateStr) || null;
}
function computePrevNoteDate(currentDateStr) {
    let sorted = [...taskDatesSet].sort().reverse();
    return sorted.find(d => d < currentDateStr) || null;
}

function findNextEventDate(fromDateStr) {
    let [y, m, d] = fromDateStr.split('-').map(Number);
    let start = new Date(y, m - 1, d);
    for (let i = 1; i <= 730; i++) {
        let dt = new Date(start);
        dt.setDate(dt.getDate() + i);
        let dateStr = getLocalDateStr(dt);
        if (getCustomItemsForDate(dateStr).some(x => x.is_event)) return dateStr;
    }
    return null;
}
function findPrevEventDate(fromDateStr) {
    let [y, m, d] = fromDateStr.split('-').map(Number);
    let start = new Date(y, m - 1, d);
    for (let i = 1; i <= 730; i++) {
        let dt = new Date(start);
        dt.setDate(dt.getDate() - i);
        let dateStr = getLocalDateStr(dt);
        if (getCustomItemsForDate(dateStr).some(x => x.is_event)) return dateStr;
    }
    return null;
}

function navigateNote(fromDateStr, direction) {
    let target = direction > 0
        ? computeNextNoteDate(fromDateStr)
        : computePrevNoteDate(fromDateStr);
    if (target) jumpToDate(target);
}

function navigateEvent(fromDateStr, direction) {
    let target = direction > 0
        ? findNextEventDate(fromDateStr)
        : findPrevEventDate(fromDateStr);
    if (target) jumpToDate(target);
}

// ============================================================
//  ОБЁРТКИ ДЛЯ ПАНЕЛИ ВКЛАДКИ «ДЕНЬ»
// ------------------------------------------------------------
//  Кнопки в index.html вызывают navigateNoteFromHere(dir) /
//  navigateEventFromHere(dir) — раньше этих функций не было,
//  и все 4 кнопки падали с ReferenceError.
// ============================================================

function navigateNoteFromHere(dir) {
    if (!window.expandedDayDateStr) return;
    navigateNote(window.expandedDayDateStr, dir);
    if (typeof renderDayView === 'function') renderDayView();
}

function navigateEventFromHere(dir) {
    if (!window.expandedDayDateStr) return;
    navigateEvent(window.expandedDayDateStr, dir);
    if (typeof renderDayView === 'function') renderDayView();
}

// ============================================================
//  СТРЕЛКИ ← →
// ------------------------------------------------------------
//  • День развёрнут (fullscreen-day) → шаг на 1 день.
//  • Иначе                          → шаг на неделю.
// ============================================================

function navigatePrev() {
    if (expandedDayDateStr) _navigateDay(-1);
    else                    changeWeek(-1);
}
function navigateNext() {
    if (expandedDayDateStr) _navigateDay(1);
    else                    changeWeek(1);
}

function _navigateDay(offset) {
    window._calDir = offset > 0 ? 'right' : 'left';
    let [y, m, d] = expandedDayDateStr.split('-').map(Number);
    let target = new Date(y, m - 1, d);
    target.setDate(target.getDate() + offset);
    let targetStr = getLocalDateStr(target);

    let dow = target.getDay();
    if (dow === 0) dow = 7;
    let monday = new Date(target);
    monday.setDate(monday.getDate() - (dow - 1));

    currentBaseDate = monday;
    expandedDayDateStr = targetStr;
    renderCalendar();
    if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();
}

function jumpToDate(dateStr) {
    let [y, m, d] = dateStr.split('-').map(Number);
    let target = new Date(y, m - 1, d);
    let dow = target.getDay();
    if (dow === 0) dow = 7;
    let monday = new Date(target);
    monday.setDate(monday.getDate() - (dow - 1));

    currentBaseDate = monday;
    expandedDayDateStr = dateStr;
    renderCalendar();

    setTimeout(() => {
        let el = document.getElementById(`day-col-${dateStr}`);
        if (!el) return;
        let headerEl = document.querySelector('.controls-header');
        let offset = headerEl ? headerEl.offsetHeight + 20 : 90;
        let top = window.pageYOffset + el.getBoundingClientRect().top - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 80);
}

;
// --- status.js ---
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

;
// --- tasks.js ---
// Заметки: создание, редактирование, цвета, drag-n-drop, undo.
// Обновление карточки — in-place, чтобы CSS-transition плавно менял
// border-left-color при переключении статуса.

const _taskBlurTimers = {};

function toggleTaskInput(dateStr) {
    let wrap = document.getElementById(`task-input-wrap-${dateStr}`);
    let input = document.getElementById(`task-input-${dateStr}`);
    if (wrap.style.display === "none") {
        wrap.style.display = "block"; input.focus();
    } else { wrap.style.display = "none"; }
}

function handleNewTask(e, dateStr) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
}

function handleTaskBlur(dateStr) {
    if (_taskBlurTimers[dateStr]) {
        clearTimeout(_taskBlurTimers[dateStr]);
        delete _taskBlurTimers[dateStr];
    }
    const input = document.getElementById(`task-input-${dateStr}`);
    const wrap  = document.getElementById(`task-input-wrap-${dateStr}`);
    if (!input) return;
    const text = input.value.trim();
    if (text === '') { if (wrap) wrap.style.display = "none"; return; }
    input.value = '';
    _taskBlurTimers[dateStr] = setTimeout(() => {
        delete _taskBlurTimers[dateStr];
        createTask(dateStr, text, 'green');
        if (wrap) wrap.style.display = "none";
    }, 100);
}

function askTaskKind() {
    return new Promise((resolve) => {
        const modalEl = document.getElementById('taskKindModal');

        if (!modalEl || typeof bootstrap === 'undefined') {
            if (confirm('Создать заметку «Сделать»?\n\nOK — Сделать, Отмена — «Сдать».')) return resolve('do');
            if (confirm('Создать заметку «Сдать»?')) return resolve('submit');
            return resolve(null);
        }

        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);

        const btnDoOld     = document.getElementById('btnTaskKindDo');
        const btnSubmitOld = document.getElementById('btnTaskKindSubmit');

        const btnDo     = btnDoOld.cloneNode(true);
        const btnSubmit = btnSubmitOld.cloneNode(true);
        btnDoOld.parentNode.replaceChild(btnDo, btnDoOld);
        btnSubmitOld.parentNode.replaceChild(btnSubmit, btnSubmitOld);

        let resolved = false;
        const finish = (value) => {
            if (resolved) return;
            resolved = true;
            modalEl.addEventListener('hidden.bs.modal', () => resolve(value), { once: true });
            modal.hide();
        };

        btnDo.onclick     = () => finish('do');
        btnSubmit.onclick = () => finish('submit');

        modalEl.addEventListener('hidden.bs.modal', () => {
            if (!resolved) resolve(null);
        }, { once: true });

        modal.show();
    });
}

async function createTaskFromSchedule(date, subject) {
    const kind = await askTaskKind();
    if (!kind) return;
    const prefix = kind === 'do' ? 'Сделать: ' : 'Сдать: ';
    createTask(date, prefix + subject, 'orange');
}

async function createTask(date, text, status) {
    try {
        let data = await apiCreateTask({date, text, status});
        taskDatesSet.add(date);
        renderTask({id: data.id, date, text, status}, { animate: true });
        if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();
        if (typeof refreshMiniCalEvents === 'function') refreshMiniCalEvents();

        const taskId = data.id;
        scheduleUndo('Заметка добавлена', async () => {
            try {
                await apiDeleteTask(taskId);
                const el = document.getElementById(`task-${taskId}`);
                if (el) { el.remove(); rebalanceDayText(date); }
                refreshTaskDates();
                if (typeof refreshMiniCalEvents === 'function') refreshMiniCalEvents();
            } catch (e) { console.error(e); }
        });
    } catch (e) { console.error("createTask failed", e); }
}

function renderTask(task, options = {}) {
    const { animate = false, stagger = -1 } = options;
    const container = document.getElementById(`tasks-${task.date}`);
    if (!container) return;

    let div = document.getElementById(`task-${task.id}`);

    if (div) {
        if (div.parentElement !== container) {
            container.appendChild(div);
        }
        _updateTaskCard(div, task);
        rebalanceDayText(task.date);
        return;
    }

    div = _buildTaskCard(task);
    if (animate) div.classList.add('task-pop-in');
    if (stagger >= 0) div.style.animationDelay = `${Math.min(stagger * 45, 450)}ms`;
    container.appendChild(div);
    rebalanceDayText(task.date);
}

function _buildTaskCard(task) {
    let div = document.createElement('div');
    div.className = `task-card status-${task.status}`;
    div.id = `task-${task.id}`;
    div.draggable = true;

    if (task.status === 'completed') div.classList.add('task-completed');
    _applyOverdueClass(div, task);

    let spanText = document.createElement('div');
    spanText.className = 'task-text';
    // Здесь innerHTML — экранирование обязательно.
    let safeText = task.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    spanText.innerHTML = `<span class="task-text-short">${safeText}</span><span class="task-text-full">${safeText}</span>`;
    spanText.onclick = () => { if (task.status !== 'completed') toggleColor(task.id, task.status); };

    let actions = document.createElement('div');
    actions.className = 'task-actions';
    _fillTaskActions(actions, task);

    div.appendChild(spanText);
    div.appendChild(actions);
    div.ondragstart = (e) => { e.dataTransfer.setData("text/plain", JSON.stringify(task)); };
    return div;
}

function _fillTaskActions(actions, task) {
    actions.innerHTML = '';

    if (task.status !== 'completed') {
        const btnEdit = document.createElement('a');
        btnEdit.className = 'task-btn task-edit';
        btnEdit.innerHTML = '✏️';
        btnEdit.onclick = (e) => {
            e.stopPropagation();
            let newText = prompt("Изменить заметку:", task.text);
            if (newText && newText.trim() !== '') {
                task.text = newText.trim();
                updateTaskRequest(task);
            }
        };
        actions.appendChild(btnEdit);
    }

    const btnDel = document.createElement('a');
    btnDel.className = 'task-btn';
    if (task.status === 'completed') { btnDel.innerHTML = '🗑️'; }
    else { btnDel.innerHTML = '×'; btnDel.style.fontSize = '1.3em'; }
    btnDel.onclick = () => handleTaskDeleteClick(task);
    actions.appendChild(btnDel);
}

function _applyOverdueClass(div, task) {
    const todayStr = getLocalDateStr(new Date());
    const isOverdue = task.status !== 'completed' && task.date < todayStr;
    div.classList.toggle('task-overdue', isOverdue);
}

function _updateTaskCard(div, task) {
    div.classList.remove('status-green', 'status-orange', 'status-red');
    div.classList.add(`status-${task.status}`);
    div.classList.toggle('task-completed', task.status === 'completed');
    _applyOverdueClass(div, task);

    // ВАЖНО: это textContent — повторное HTML-экранирование здесь вредно.
    // Раньше после редактирования «a < b» превращалось в «a &lt; b».
    const shortEl = div.querySelector('.task-text-short');
    const fullEl  = div.querySelector('.task-text-full');
    if (shortEl) shortEl.textContent = task.text;
    if (fullEl)  fullEl.textContent  = task.text;

    const actions = div.querySelector('.task-actions');
    if (actions) _fillTaskActions(actions, task);

    const spanText = div.querySelector('.task-text');
    if (spanText) {
        spanText.onclick = () => { if (task.status !== 'completed') toggleColor(task.id, task.status); };
    }

    div.ondragstart = (e) => { e.dataTransfer.setData("text/plain", JSON.stringify(task)); };
}

function updateTaskRequest(task) {
    renderTask(task);
    apiUpdateTask(task.id, {date: task.date, text: task.text, status: task.status})
        .then(() => {
            if (typeof refreshMiniCalEvents === 'function') refreshMiniCalEvents();
        })
        .catch(e => console.error("updateTask failed", e));
}

function handleTaskDeleteClick(task) {
    if (task.status !== 'completed') {
        const prevStatus = task.status;
        task.status = 'completed';
        updateTaskRequest(task);

        scheduleUndo('Заметка завершена', () => {
            const restored = { ...task, status: prevStatus };
            updateTaskRequest(restored);
        });
    } else {
        const el = document.getElementById(`task-${task.id}`);
        if (!el) return;

        const snapshot = { date: task.date, text: task.text, status: task.status };
        _animateTaskRemoval(el, () => rebalanceDayText(task.date));
        apiDeleteTask(task.id)
            .then(() => {
                refreshTaskDates();
                if (typeof refreshMiniCalEvents === 'function') refreshMiniCalEvents();
            })
            .catch(e => console.error(e));

        scheduleUndo('Заметка удалена', async () => {
            try {
                const resp = await apiCreateTask(snapshot);
                taskDatesSet.add(snapshot.date);
                renderTask({id: resp.id, date: snapshot.date, text: snapshot.text, status: snapshot.status}, { animate: true });
                if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();
                if (typeof refreshMiniCalEvents === 'function') refreshMiniCalEvents();
            } catch (e) { console.error(e); }
        });
    }
}

function _animateTaskRemoval(el, onDone) {
    el.style.pointerEvents = 'none';
    el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    void el.offsetWidth;
    el.style.opacity = '0';
    el.style.transform = 'scale(0.85)';
    setTimeout(() => {
        el.remove();
        if (typeof onDone === 'function') onDone();
    }, 200);
}

function toggleColor(id, currentStatus) {
    let taskElement = document.getElementById(`task-${id}`);
    if (!taskElement) return;
    let newStatus = currentStatus === 'green' ? 'orange' : (currentStatus === 'orange' ? 'red' : 'green');
    let fullEl = taskElement.querySelector('.task-text-full');
    let text = fullEl ? fullEl.textContent : '';
    let dateId = taskElement.parentElement.id.replace('tasks-', '');
    updateTaskRequest({id, date: dateId, text, status: newStatus});
}

// Дубль allowDrop удалён — он уже объявлен в state.js (общий для всех
// HTML-обработчиков ondragover/ondrop).

function drop(e, newDate) {
    e.preventDefault();
    let taskData = JSON.parse(e.dataTransfer.getData("text/plain"));
    if (taskData.date === newDate) return;
    let oldDate = taskData.date;

    const snapshot = { ...taskData };

    taskData.date = newDate;
    updateTaskRequest(taskData);
    setTimeout(() => rebalanceDayText(oldDate), 50);
    if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();

    scheduleUndo('Заметка перенесена', () => {
        const back = { ...snapshot, date: oldDate };
        updateTaskRequest(back);
        setTimeout(() => rebalanceDayText(newDate), 50);
        if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();
    });
}

async function refreshTaskDates() {
    try {
        let dates = await apiLoadTaskDates();
        taskDatesSet = new Set(dates);
        if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();
        if (typeof refreshMiniCalEvents === 'function') refreshMiniCalEvents();
    } catch (e) { console.error("refreshTaskDates", e); }
}

function renderTasksStaggered(tasks) {
    if (!Array.isArray(tasks)) return;

    const byDate = {};
    tasks.forEach(t => {
        if (!byDate[t.date]) byDate[t.date] = [];
        byDate[t.date].push(t);
    });

    for (const date in byDate) {
        byDate[date].forEach((t, idx) => {
            renderTask(t, { stagger: idx });
        });
    }
}

;
// --- friends.js ---
// Друзья: список, общие пары, корпуса, фоновый синк.

let _currentFriendIndex = 0;

// Счётчик поколений. Увеличивается при ротации.
// fetchFriends сравнивает свой стартовый номер с текущим и
// игнорирует устаревший ответ.
let _friendsGeneration = 0;

// ============================================================
//  ПРОКРУТКА
// ============================================================

function rotateFriendsRight() {
    if (!Array.isArray(friendsList) || friendsList.length < 2) return;
    _currentFriendIndex = (_currentFriendIndex + 1) % friendsList.length;
    renderFriendsCalendar();
}

// ============================================================
//  ОБЩИЕ ПАРЫ
// ============================================================

function _allPairsMatch(myDaySchedule, friendDaySchedule) {
    if (myDaySchedule.length === 0) return false;
    return myDaySchedule.every(myItem =>
        friendDaySchedule.some(fItem =>
            myItem.time_range === fItem.time_range &&
            myItem.lesson === fItem.lesson &&
            (myItem.location || '').trim().toLowerCase() === (fItem.location || '').trim().toLowerCase()
        )
    );
}

function _countCommonPairsForFriend(friendDaySchedule, myDaySchedule) {
    if (!friendDaySchedule.length || !myDaySchedule.length) return 0;
    let count = 0;
    friendDaySchedule.forEach(fItem => {
        const match = myDaySchedule.find(myItem =>
            myItem.time_range === fItem.time_range &&
            myItem.lesson === fItem.lesson &&
            (myItem.location || '').trim().toLowerCase() === (fItem.location || '').trim().toLowerCase()
        );
        if (match) count++;
    });
    return count;
}

// ============================================================
//  FETCH + ФОНОВЫЙ АВТОСИНК
// ============================================================

async function fetchFriends() {
    const myGen = ++_friendsGeneration;

    let list = [];
    try { list = await apiLoadFriends(); } catch (e) { list = []; }

    // Пока шёл запрос — прошла перестановка/другая выборка.
    // Наш ответ устарел, не перезаписываем состояние.
    if (myGen !== _friendsGeneration) return;

    friendsList = Array.isArray(list) ? list : [];

    if (_currentFriendIndex >= friendsList.length) _currentFriendIndex = 0;

    await fetchAllFriendsSchedules();

    if (myGen !== _friendsGeneration) return;

    renderFriendsCalendar();
}

async function fetchAllFriendsSchedules() {
    let promises = friendsList.map(async (friend) => {
        if (!friendsSchedules[friend.id]) {
            try {
                let data = await apiLoadSchedule(friend.group, friend.subgroup);
                friendsSchedules[friend.id] = applyTimeFix(data);
            } catch (e) { friendsSchedules[friend.id] = []; }
        }
    });
    await Promise.all(promises);
}

async function syncFriendsSchedules(force = false) {
    if (!force) {
        const now = Date.now();
        if (window._lastFriendsSync && now - window._lastFriendsSync < 30 * 60 * 1000) return;
    }
    window._lastFriendsSync = Date.now();

    for (let friend of friendsList) {
        try {
            let newData = applyTimeFix(await apiSyncSchedule(friend.group, friend.subgroup));
            if (!Array.isArray(newData) || newData.length === 0) continue;

            // Защита от затирания (со стороны бэкенда уже есть, но дублируем)
            if (friendsSchedules[friend.id] && friendsSchedules[friend.id].length > 0
                && newData.length < friendsSchedules[friend.id].length * 0.9) {
                continue;
            }
            if (isScheduleDifferent(newData, friendsSchedules[friend.id])) {
                friendsSchedules[friend.id] = newData;
                renderFriendsCalendar();
            }
        } catch (e) { console.error("Ошибка синхронизации друга", e); }
    }
}

// ============================================================
//  МОДАЛКИ ДОБАВЛЕНИЯ / РЕДАКТИРОВАНИЯ
// ------------------------------------------------------------
function showAddFriendModal() {
    editingFriendId = null;
    document.getElementById('friendName').value = '';
    document.getElementById('friendGroup').value = '';
    document.getElementById('friendSubgroup').value = '0';
    new bootstrap.Modal(document.getElementById('addFriendModal')).show();
}

function editFriend(id, name, group, subgroup) {
    editingFriendId = id;
    document.getElementById('friendName').value = name;
    document.getElementById('friendGroup').value = group;
    document.getElementById('friendSubgroup').value = subgroup;
    new bootstrap.Modal(document.getElementById('addFriendModal')).show();
}

async function saveFriend() {
    let name = document.getElementById('friendName').value.trim();
    let group = document.getElementById('friendGroup').value.trim();
    let subgroup = document.getElementById('friendSubgroup').value;
    if (!name || !group) return alert("Введите имя и группу");

    let myGroup    = (document.getElementById('groupSelect').value || '').trim();
    let mySubgroup = String(document.getElementById('subgroupSelect').value || '0');
    if (myGroup && group.toLowerCase() === myGroup.toLowerCase() && String(subgroup) === mySubgroup) {
        return alert("Друг в той же группе, что и вы");
    }

    // Если группа неизвестна — предложим добавить в справочник
    await ensureGroupsLoaded();
    if (validGroups.size > 0 && !validGroups.has(group.toUpperCase())) {
        let add = confirm(`Группа «${group}» не найдена в справочнике.\n\nДобавить её в вашу базу?`);
        if (!add) return;
        try {
            await apiAddCustomGroup(group);
            validGroups.add(group.toUpperCase());
            allGroups.push(group);
        } catch (e) { console.error(e); }
    }

    try {
        if (editingFriendId) await apiUpdateFriend(editingFriendId, {name, group, subgroup});
        else await apiCreateFriend({name, group, subgroup});
    } catch (e) { return alert("Не удалось сохранить"); }
    bootstrap.Modal.getInstance(document.getElementById('addFriendModal')).hide();
    await fetchFriends();
}

async function deleteFriend(id) {
    if (!confirm("Вы действительно хотите удалить друга из списка?")) return;
    try {
        await apiDeleteFriend(id);
        delete friendsSchedules[id];
        if (_currentFriendIndex >= friendsList.length - 1 && _currentFriendIndex > 0) _currentFriendIndex--;
        await fetchFriends();
    } catch (e) {}
}

// ============================================================
//  РЕНДЕР КАЛЕНДАРЯ ДРУГА (одного)
// ============================================================

function renderFriendsCalendar(dir = null) {
    let container = document.getElementById("friendsCalendarsContainer");
    if (!container) return;
    container.innerHTML = '';

    if (!friendsList || friendsList.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-title">Пока никого нет</div><div class="empty-state-text">Нажмите «+».</div></div>`;
        return;
    }

    if (_currentFriendIndex >= friendsList.length) _currentFriendIndex = 0;
    const friend = friendsList[_currentFriendIndex];
    let friendSched = friendsSchedules[friend.id] || [];
    let realTodayStr = getLocalDateStr(new Date());

    let wrapper = document.createElement('div');
    wrapper.className = "friend-wrapper bg-white rounded shadow-sm px-2 pb-2 pt-1";

    let header = document.createElement('div');
    header.className = "fw-bold text-primary mb-2 ps-1 pt-1 friend-header-row d-flex align-items-center justify-content-between";
    header.innerHTML = `
        <span>👤 ${escapeHtml(friend.name)} <span class="text-muted small fw-normal ms-1">(${escapeHtml(friend.group)}${friend.subgroup && friend.subgroup !== '0' ? ', подгр. ' + escapeHtml(String(friend.subgroup)) : ', все подгруппы'})</span></span>
        <div class="d-flex align-items-center gap-1">
            <button class="btn btn-sm btn-link text-primary p-0 me-2 text-decoration-none" onclick="editFriend(${friend.id}, '${escapeJsString(friend.name)}', '${escapeJsString(friend.group)}', '${friend.subgroup}')">✏️</button>
            <button class="btn btn-sm btn-link text-danger p-0 text-decoration-none" onclick="deleteFriend(${friend.id})">🗑️</button>
        </div>`;
    wrapper.appendChild(header);

    let grid = document.createElement('div');
    grid.className = "calendar-grid w-100";
    grid.classList.remove('slide-left', 'slide-right', 'fade-in');
    void grid.offsetWidth;
    if (dir === 'right')      grid.classList.add('slide-right');
    else if (dir === 'left')  grid.classList.add('slide-left');
    else                      grid.classList.add('fade-in');

    const dayParts = [];
    for (let i = 0; i < 7; i++) {
        let d = new Date(currentBaseDate); d.setDate(d.getDate() + i);
        let dateStr = getLocalDateStr(d);
        let displayDate = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
        let daySchedule = friendSched.filter(item => item.date === dateStr).sort((a, b) => (a.n || 0) - (b.n || 0));
        let myDaySchedule = cachedSchedule.filter(item => item.date === dateStr).sort((a, b) => (a.n || 0) - (b.n || 0));
        let isTodayClass = (dateStr === realTodayStr) ? " day-today" : "";

        let html = `<div class="friend-col${isTodayClass}"><div class="friend-day-header">${displayDate}</div>`;

        if (daySchedule.length > 0) {
            let fStart = fixTime(daySchedule[0].time_range.split(' - ')[0]);
            let fEnd = fixTime(daySchedule[daySchedule.length - 1].time_range.split(' - ')[1]);
            let fCampStart = getCampus(daySchedule[0]);
            let fCampEnd = getCampus(daySchedule[daySchedule.length - 1]);

            html += `<div class="fw-bold text-primary mb-2 text-center border-bottom pb-1" style="font-size: 0.8em;">🕒 ${fStart} - ${fEnd}</div>`;

            const allMatch = _allPairsMatch(myDaySchedule, daySchedule);

            if (allMatch) {
                html += `<div class="shared-class shared-common fw-bold">🤝 Все пары совпадают</div>`;
            } else {
                daySchedule.forEach(fItem => {
                    const match = myDaySchedule.find(myItem =>
                        myItem.time_range === fItem.time_range &&
                        myItem.lesson === fItem.lesson &&
                        (myItem.location || '').trim().toLowerCase() === (fItem.location || '').trim().toLowerCase()
                    );
                    if (match) {
                        html += `<div class="shared-class shared-common fw-bold">🤝 Общая пара в ${fixTime(fItem.time_range.split(' - ')[0])}</div>`;
                    }
                });

                let myStart = myDaySchedule.length > 0 ? fixTime(myDaySchedule[0].time_range.split(' - ')[0]) : null;
                let myEnd   = myDaySchedule.length > 0 ? fixTime(myDaySchedule[myDaySchedule.length - 1].time_range.split(' - ')[1]) : null;
                let myCampStart = myDaySchedule.length > 0 ? getCampus(myDaySchedule[0]) : 'unknown';
                let myCampEnd   = myDaySchedule.length > 0 ? getCampus(myDaySchedule[myDaySchedule.length - 1]) : 'unknown';

                if (myStart && fStart === myStart) {
                    if (fCampStart !== 'unknown' && myCampStart !== 'unknown') {
                        if (fCampStart !== myCampStart) {
                            html += `<div class="shared-class shared-warning fw-bold">🚨 Начинаем одновременно в ${fStart}, но в разных корпусах</div>`;
                        } else {
                            const campRu = campusNames[fCampStart] || fCampStart;
                            html += `<div class="shared-class shared-same-campus fw-bold">🏃 Начинаем одновременно в корпусе «${campRu}» в ${fStart}</div>`;
                        }
                    } else {
                        html += `<div class="shared-class shared-info fw-bold">🕒 Начинаем в одно время: ${fStart}</div>`;
                    }
                }
                if (myEnd && fEnd === myEnd) {
                    if (fCampEnd !== 'unknown' && myCampEnd !== 'unknown') {
                        if (fCampEnd !== myCampEnd) {
                            html += `<div class="shared-class shared-warning fw-bold">🚨 Заканчиваем одновременно в ${fEnd}, но в разных корпусах</div>`;
                        } else {
                            const campRu = campusNames[fCampEnd] || fCampEnd;
                            html += `<div class="shared-class shared-same-campus fw-bold">🏡 Заканчиваем одновременно в корпусе «${campRu}» в ${fEnd}</div>`;
                        }
                    } else {
                        html += `<div class="shared-class shared-info fw-bold">🕒 Заканчиваем в одно время: ${fEnd}</div>`;
                    }
                }
            }

            if (showFriends) {
                html += `<div class="mt-2 border-top pt-2">`;
                daySchedule.forEach(fItem => {
                    const subjectKey = `${fItem.lesson} (${fItem.type_name})`;
                    let displayLesson   = fItem.lesson;
                    let lessonLink      = '';
                    let displayTeacher  = fItem.teacher  || '';
                    let displayLocation = fItem.location || '';

                    if (cachedSubjectSettings && cachedSubjectSettings[subjectKey]) {
                        const s = cachedSubjectSettings[subjectKey];
                        if (s.custom_name) displayLesson   = s.custom_name;
                        if (s.link)        lessonLink      = s.link;
                        if (s.teacher)     displayTeacher  = s.teacher;
                        if (s.location)    displayLocation = s.location;
                    }

                    let typeBadge = fItem.type_name
                        ? `<span class="badge bg-secondary" style="font-size: 0.7em;">${escapeHtml(fItem.type_name)}</span>`
                        : '';

                    // safeHref возвращает уже экранированную строку
                    // и отсекает не-http(s)/mailto. Раньше сюда попадал
                    // сырой s.link → XSS через кавычку в href.
                    const href = safeHref(lessonLink);
                    let lessonHtml = href
                        ? `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-decoration-none fw-bold" style="color: var(--accent);" title="${escapeHtml(fItem.lesson)}">${escapeHtml(displayLesson)}</a>`
                        : `<span title="${escapeHtml(fItem.lesson)}">${escapeHtml(displayLesson)}</span>`;

                    let teacherHtml = (showTeacher && displayTeacher)
                        ? `<div class="schedule-item-teacher">${escapeHtml(displayTeacher)}</div>` : '';
                    let locationHtml = (showLocation && displayLocation)
                        ? `<div class="schedule-item-location">${escapeHtml(displayLocation)}</div>` : '';

                    html += `
                        <div class="schedule-item shadow-sm" style="border-left: 3px solid var(--border-color);">
                            <div class="schedule-item-top">
                                <span class="schedule-item-time">
                                    <strong class="text-primary">${fixTime(fItem.time_range)}</strong>
                                </span>
                            </div>
                            ${typeBadge ? `<div class="schedule-item-badge">${typeBadge}</div>` : ''}
                            <div class="schedule-item-title">${lessonHtml}</div>
                            ${teacherHtml}
                            ${locationHtml}
                        </div>`;
                });
                html += `</div>`;
            }
        } else {
            html += `<div class="text-muted text-center mt-2" style="font-size: 0.8em;">Выходной</div>`;
        }
        html += `</div>`;
        dayParts.push(html);
    }
    grid.innerHTML = dayParts.join('');
    wrapper.appendChild(grid);
    container.appendChild(wrapper);
}

;
// --- custom-schedule.js ---
// Кастомное расписание (события и пары) + настройки предметов.

const classTimes = {
    "1": {start: "08:30", end: "10:00"},
    "2": {start: "10:10", end: "11:40"},
    "3": {start: "11:50", end: "13:20"},
    "4": {start: "14:00", end: "15:30"},
    "5": {start: "15:40", end: "17:10"},
    "6": {start: "17:20", end: "18:50"},
    "7": {start: "19:00", end: "20:30"},
    "8": {start: "20:40", end: "22:10"}
};

function updateTimeFromClassNum() {
    let num = document.getElementById('csClassNum').value;
    if (classTimes[num]) {
        document.getElementById('csTimeStart').value = classTimes[num].start;
        document.getElementById('csTimeEnd').value   = classTimes[num].end;
    }
}

function toggleCsFields() {
    let isEvent = document.getElementById('csTypeEvent').checked;
    document.getElementById('csClassFields').style.display = isEvent ? 'none' : 'block';
    document.getElementById('csLessonLabel').textContent = isEvent ? 'Текст события' : 'Название предмета';

    let selectNum   = document.getElementById('csClassNum');
    let timeWrapper = document.getElementById('csTimeWrapper');

    if (isEvent) {
        selectNum.style.display = 'none';
        timeWrapper.style.display = 'flex';
    } else {
        selectNum.style.display = 'block';
        timeWrapper.style.display = 'flex';
        updateTimeFromClassNum();
    }
}

function checkScheduleConflict(baseDateStr, timeRange, recurrence, ignoreCustomId = null) {
    let datesToCheck = [];
    let [y, m, d] = baseDateStr.split('-');
    let currD = new Date(y, m - 1, d);

    if (recurrence === 'none') {
        datesToCheck.push(baseDateStr);
    } else {
        let limit = recurrence === 'weekly' ? 25 : 12;
        for (let i = 0; i < limit; i++) {
            datesToCheck.push(getLocalDateStr(new Date(currD)));
            currD.setDate(currD.getDate() + (recurrence === 'weekly' ? 7 : 14));
        }
    }

    for (let checkDate of datesToCheck) {
        let dayConflicts = [];
        let daySched = cachedSchedule.filter(x => x.date === checkDate);
        for (let item of daySched) if (isTimeOverlap(timeRange, item.time_range)) dayConflicts.push(`парой "${item.lesson}"`);

        let customSched = getCustomItemsForDate(checkDate);
        for (let item of customSched) {
            if (item.custom_id == ignoreCustomId) continue;
            if (isTimeOverlap(timeRange, item.time_range)) {
                let kind = item.is_event ? 'событием' : 'кастомной парой';
                dayConflicts.push(`${kind} "${item.lesson}"`);
            }
        }

        if (dayConflicts.length === 1) return { conflict: true, msg: `Внимание! На ${checkDate} обнаружено пересечение с ${dayConflicts[0]}.` };
        if (dayConflicts.length > 1) return { conflict: true, msg: `Внимание! На ${checkDate} присутствуют многочисленные пересечения.` };
    }
    return null;
}

function askRecurrenceMode(actionTitle, targetDate) {
    return new Promise((resolve) => {
        document.getElementById('recurrenceActionTitle').textContent = actionTitle;
        let btnSingle = document.getElementById('btnRecurrenceSingle');
        let btnAll = document.getElementById('btnRecurrenceAll');
        btnSingle.textContent = `Только на этой неделе (${targetDate})`;

        let modalEl = document.getElementById('recurrenceActionModal');
        let modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);

        let newBtnSingle = btnSingle.cloneNode(true);
        btnSingle.parentNode.replaceChild(newBtnSingle, btnSingle);
        let newBtnAll = btnAll.cloneNode(true);
        btnAll.parentNode.replaceChild(newBtnAll, btnAll);

        let resolved = false;
        newBtnSingle.onclick = () => { resolved = true; modalEl.addEventListener('hidden.bs.modal', () => resolve("1"), { once: true }); modal.hide(); };
        newBtnAll.onclick = () => { resolved = true; modalEl.addEventListener('hidden.bs.modal', () => resolve("2"), { once: true }); modal.hide(); };
        modalEl.addEventListener('hidden.bs.modal', () => { if (!resolved) resolve(null); }, { once: true });
        modal.show();
    });
}

function openCustomScheduleModal(dateStr, itemId = null) {
    document.getElementById('csTargetDate').value = dateStr;
    let modalTitle = document.getElementById('customScheduleModalTitle');
    let delBtn = document.getElementById('csDeleteBtn');

    if (itemId) {
        let item = customScheduleItems.find(i => i.id === itemId);
        if (!item) return;
        document.getElementById('csId').value = item.id;
        document.getElementById('csBaseDate').value = item.base_date;
        modalTitle.textContent = 'Редактировать';
        delBtn.style.display = 'block';

        // Защита от кривого time_range: сервер теперь валидирует формат,
        // но старые записи могли сохраниться битыми. Не крашим модалку.
        let parts = String(item.time_range || '').split('-');
        let tStart = parts[0] ? parts[0].trim() : '';
        let tEnd   = parts[1] ? parts[1].trim() : '';
        document.getElementById('csTimeStart').value = tStart;
        document.getElementById('csTimeEnd').value = tEnd;

        if (item.is_event) {
            document.getElementById('csTypeEvent').checked = true;
        } else {
            document.getElementById('csTypeClass').checked = true;
            for (let num in classTimes) {
                if (classTimes[num].start === tStart && classTimes[num].end === tEnd) {
                    document.getElementById('csClassNum').value = num;
                    break;
                }
            }
        }

        document.getElementById('csLesson').value = item.lesson;
        document.getElementById('csTypeName').value = item.type_name || '';
        document.getElementById('csTeacher').value = item.teacher || '';
        document.getElementById('csLocation').value = item.location || '';
        document.getElementById('csRecurrence').value = item.recurrence || 'none';
    } else {
        document.getElementById('csId').value = '';
        document.getElementById('csBaseDate').value = dateStr;
        modalTitle.textContent = 'Добавить в расписание';
        delBtn.style.display = 'none';
        document.getElementById('csTypeEvent').checked = true;

        let now = new Date();
        let h = now.getHours();
        document.getElementById('csTimeStart').value = String(h).padStart(2, '0') + ':00';
        document.getElementById('csTimeEnd').value   = String((h + 1) % 24).padStart(2, '0') + ':00';

        document.getElementById('csLesson').value = '';
        document.getElementById('csTypeName').value = '';
        document.getElementById('csTeacher').value = '';
        document.getElementById('csLocation').value = '';
        document.getElementById('csRecurrence').value = 'none';
    }
    toggleCsFields();

    let modalEl = document.getElementById('customScheduleModal');
    let modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.show();
}

async function saveCustomSchedule() {
    let group = document.getElementById('groupSelect').value.trim();
    let id = document.getElementById('csId').value;
    let targetDate = document.getElementById('csTargetDate').value;
    let start = document.getElementById('csTimeStart').value;
    let end = document.getElementById('csTimeEnd').value;

    if (!start || !end) return alert("Заполните время!");

    // Сравнение по минутам, а не лексикографически: «8:00» < «10:00»,
    // хотя строка '8:00' > '10:00'.
    const [sMins, eMins] = parseTimeRangeToMins(`${start} - ${end}`);
    if (sMins >= eMins) return alert("Ошибка: Начальное время должно быть строго раньше времени окончания!");

    let time_range = `${start} - ${end}`;

    let payload = {
        group: group,
        base_date: document.getElementById('csBaseDate').value,
        is_event: document.getElementById('csTypeEvent').checked ? 1 : 0,
        time_range: time_range,
        lesson: document.getElementById('csLesson').value.trim(),
        type_name: document.getElementById('csTypeName').value.trim(),
        teacher: document.getElementById('csTeacher').value.trim(),
        location: document.getElementById('csLocation').value.trim(),
        recurrence: document.getElementById('csRecurrence').value,
        exceptions: '[]'
    };

    if (!payload.lesson) return alert("Заполните название!");

    let conflict = checkScheduleConflict(payload.base_date, payload.time_range, payload.recurrence, id);
    if (conflict && !confirm(conflict.msg + "\n\nВсё равно сохранить?")) return;

    try {
        if (id) {
            let originalItem = customScheduleItems.find(i => i.id == id);
            if (originalItem && originalItem.recurrence !== 'none') {
                let mode = await askRecurrenceMode("Изменить событие", targetDate);
                if (mode === "1") {
                    let ex = JSON.parse(originalItem.exceptions || '[]');
                    if (!ex.includes(targetDate)) ex.push(targetDate);
                    await apiUpdateCustomSchedule(id, {...originalItem, exceptions: JSON.stringify(ex)});
                    payload.base_date = targetDate;
                    payload.recurrence = 'none';
                    await apiCreateCustomSchedule(payload);
                    let mainModal = bootstrap.Modal.getInstance(document.getElementById('customScheduleModal'));
                    if (mainModal) mainModal.hide();
                    await refreshCustomSchedule();
                    return;
                } else if (mode !== "2") return;
            }
            payload.exceptions = originalItem ? originalItem.exceptions : '[]';
            await apiUpdateCustomSchedule(id, payload);
        } else {
            await apiCreateCustomSchedule(payload);
        }
    } catch (e) { return alert("Не удалось сохранить: " + e.message); }

    let mainModal = bootstrap.Modal.getInstance(document.getElementById('customScheduleModal'));
    if (mainModal) mainModal.hide();
    await refreshCustomSchedule();
}

async function deleteCustomSchedule() {
    let id = document.getElementById('csId').value;
    let targetDate = document.getElementById('csTargetDate').value;
    let originalItem = customScheduleItems.find(i => i.id == id);

    if (originalItem && originalItem.recurrence !== 'none') {
        let mode = await askRecurrenceMode("Удалить событие", targetDate);
        if (mode === "1") {
            let ex = JSON.parse(originalItem.exceptions || '[]');
            if (!ex.includes(targetDate)) ex.push(targetDate);
            await apiUpdateCustomSchedule(id, {...originalItem, exceptions: JSON.stringify(ex)});
            let mainModal = bootstrap.Modal.getInstance(document.getElementById('customScheduleModal'));
            if (mainModal) mainModal.hide();
            await refreshCustomSchedule();
            return;
        } else if (mode !== "2") return;
    } else {
        if (!confirm('Удалить этот элемент?')) return;
    }

    try { await apiDeleteCustomSchedule(id); } catch (e) { return alert("Не удалось удалить"); }

    let mainModal = bootstrap.Modal.getInstance(document.getElementById('customScheduleModal'));
    if (mainModal) mainModal.hide();
    await refreshCustomSchedule();
}

async function refreshCustomSchedule() {
    let group = document.getElementById('groupSelect').value.trim();
    try { customScheduleItems = await apiLoadCustomSchedule(group); }
    catch (e) { customScheduleItems = []; }
    renderCalendar();
    if (typeof refreshMiniCalEvents === 'function') refreshMiniCalEvents();
    // Пере-планируем напоминания сразу после изменения custom_schedule.
    if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications();
}

// --- Настройки предметов ---

async function fetchSubjectSettings() {
    try { cachedSubjectSettings = await apiLoadSubjects(); }
    catch (e) { cachedSubjectSettings = {}; }
}

function openSubjectSettings(origLesson) {
    document.getElementById('origSubjectName').value = origLesson;
    document.getElementById('subjectOrigNameDisplay').textContent = origLesson;

    let s = cachedSubjectSettings[origLesson] || {};
    document.getElementById('subjectCustomName').value = s.custom_name || "";
    document.getElementById('subjectLink').value       = s.link || "";
    document.getElementById('subjectTeacher').value    = s.teacher || "";
    document.getElementById('subjectLocation').value   = s.location || "";

    new bootstrap.Modal(document.getElementById('subjectSettingsModal')).show();
}

async function saveSubjectSettings() {
    let payload = {
        subject: document.getElementById('origSubjectName').value,
        custom_name: document.getElementById('subjectCustomName').value.trim(),
        link: document.getElementById('subjectLink').value.trim(),
        teacher: document.getElementById('subjectTeacher').value.trim(),
        location: document.getElementById('subjectLocation').value.trim()
    };

    try { await apiSaveSubject(payload); } catch (e) { return alert("Не удалось сохранить"); }

    let modalEl = document.getElementById('subjectSettingsModal');
    let modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    await fetchSubjectSettings();
    renderCalendar();
}

;
// --- widgets-stats.js ---
// Виджет «Остаток пар»: модалка со статистикой + компактная
// панель деталей для горизонтального режима.

// ============================================================
//  МОДАЛКА «ОСТАТОК ПАР»
// ============================================================

function showStats() {
    const group = document.getElementById("groupSelect").value.trim();
    if (!group || cachedSchedule.length === 0) return alert("Сначала загрузите расписание!");

    new bootstrap.Modal(document.getElementById('statsModal')).show();

    let stats = {};
    let todayStr = getLocalDateStr(new Date());
    let totalPast = 0, totalFuture = 0;

    cachedSchedule.forEach(item => {
        let subject = item.lesson;
        let type = item.type_name;
        if (!stats[subject]) stats[subject] = { display: subject, types: {} };
        if (!stats[subject].types[type]) stats[subject].types[type] = { past: 0, future: 0 };
        if (item.date < todayStr) {
            stats[subject].types[type].past++;
            totalPast++;
        } else {
            stats[subject].types[type].future++;
            totalFuture++;
        }
    });

    let html = `
        <div class="stats-summary">
            <div class="stats-summary-item">
                <div class="stats-summary-num stats-summary-past">${totalPast}</div>
                <div class="stats-summary-label">Прошло</div>
            </div>
            <div class="stats-summary-item">
                <div class="stats-summary-num stats-summary-future">${totalFuture}</div>
                <div class="stats-summary-label">Осталось</div>
            </div>
        </div>
        <div class="stats-grid">
    `;

    for (let subject in stats) {
        let subj = stats[subject];
        html += `
            <div class="stats-card">
                <div class="stats-card-header" title="${escapeHtml(subj.display)}">${escapeHtml(subj.display)}</div>
                <div class="stats-card-body">
        `;
        for (let type in subj.types) {
            let past = subj.types[type].past;
            let future = subj.types[type].future;
            let total = past + future;
            let pct = total > 0 ? Math.round((past / total) * 100) : 0;
            html += `
                <div class="stats-row">
                    <div class="stats-row-head">
                        <span class="stats-row-label">${escapeHtml(type)}</span>
                        <span class="stats-row-counts">
                            <span class="stats-row-past">${past}</span>
                            <span class="stats-row-sep">/</span>
                            <span class="stats-row-total">${total}</span>
                        </span>
                    </div>
                    <div class="stats-row-bar">
                        <div class="stats-row-bar-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }
        html += `</div></div>`;
    }
    html += '</div>';

    if (Object.keys(stats).length === 0) {
        html = "<p class='text-center'>Нет данных для выбранной группы.</p>";
    }
    document.getElementById('statsContent').innerHTML = html;
}

// ============================================================
//  КОМПАКТНАЯ ПАНЕЛЬ ДЕТАЛЕЙ (горизонтальный режим)
// ============================================================

function _renderGlobalStatsDetails() {
    const el = document.getElementById('globalStatsDetails');
    if (!el) return;

    const todayStr = getLocalDateStr(new Date());
    const stats = {};

    cachedSchedule.forEach(item => {
        const subj = item.lesson;
        if (!stats[subj]) stats[subj] = { past: 0, total: 0 };
        stats[subj].total++;
        if (item.date < todayStr) stats[subj].past++;
    });

    const subjects = Object.keys(stats).sort((a, b) => a.localeCompare(b, 'ru'));

    if (subjects.length === 0) {
        el.innerHTML = '<div class="text-muted small">Нет данных</div>';
        return;
    }

    let html = '';
    subjects.forEach(subj => {
        const s = stats[subj];
        html += `
            <div class="widget-details-row" title="${escapeHtml(subj)}">
                <span class="widget-details-title">${escapeHtml(getDisplaySubjectKey(subj))}</span>
                <span class="widget-details-nums">${s.past} / ${s.total}</span>
            </div>
        `;
    });
    el.innerHTML = html;
}

;
// --- widgets-labs.js ---
// Сводка лабораторных: модалка управления, панель деталей
// для горизонтального режима, «Темп сдачи лаб».

// ============================================================
//  МОДАЛКА «ЛАБОРАТОРНЫЕ»
// ============================================================

function showLabs() {
    const group = document.getElementById("groupSelect").value.trim();
    if (!group || cachedSchedule.length === 0) return alert("Сначала загрузите расписание!");
    renderLabsContent();
    new bootstrap.Modal(document.getElementById('labsModal')).show();
}

function renderLabsContent() {
    let labItems = cachedSchedule.filter(item => item.type_name === 'ЛЗ' || item.type_name === 'ПЗ');
    let uniqueSubjects = [...new Set(labItems.map(item => `${item.lesson} (${item.type_name})`))].sort();
    currentSubjectsList = uniqueSubjects;

    let html = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <span class="text-muted small">Внесите изменения и нажмите "Сохранить все"</span>
            <button class="btn btn-sm btn-primary px-4 shadow-sm" onclick="saveAllLabs()">Сохранить все</button>
        </div>
        <div class="list-group mb-3">
    `;

    uniqueSubjects.forEach((subjKey, idx) => {
        let comp = cachedLabs[subjKey] ? cachedLabs[subjKey].completed : 0;
        let tot = cachedLabs[subjKey] ? cachedLabs[subjKey].total : 0;
        let percent = tot > 0 ? Math.round((comp / tot) * 100) : 0;
        let displaySubj = getDisplaySubjectKey(subjKey);
        html += `
            <div class="list-group-item border-0 shadow-sm mb-2 rounded">
                <h6 class="mb-2 fw-bold" style="font-size:0.9em" title="${escapeHtml(subjKey)}">${escapeHtml(displaySubj)}</h6>
                <div class="d-flex align-items-center gap-2 mb-2">
                    <span style="font-size: 0.85em;">Сдано:</span>
                    <input type="number" id="lab-comp-${idx}" class="form-control form-control-sm" style="width: 70px" value="${comp}" min="0">
                    <span style="font-size: 0.85em;">из</span>
                    <input type="number" id="lab-tot-${idx}" class="form-control form-control-sm" style="width: 70px" value="${tot}" min="0">
                </div>
                <div class="progress" style="height: 10px;">
                    <div class="progress-bar ${percent === 100 ? 'bg-success' : 'bg-info'}" role="progressbar" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    });
    html += `</div><div class="d-flex justify-content-end mb-2"><button class="btn btn-sm btn-primary px-4 shadow-sm" onclick="saveAllLabs()">Сохранить все</button></div>`;

    if (uniqueSubjects.length === 0) html = "<p class='text-center'>Нет данных.</p>";
    document.getElementById('labsContent').innerHTML = html;
}

async function saveAllLabs() {
    const group = document.getElementById("groupSelect").value.trim();
    let payload = [];
    currentSubjectsList.forEach((subject, idx) => {
        let comp = parseInt(document.getElementById(`lab-comp-${idx}`).value) || 0;
        let tot = parseInt(document.getElementById(`lab-tot-${idx}`).value) || 0;
        if (comp > tot) comp = tot;
        payload.push({ group, subject, completed: comp, total: tot });
    });
    try {
        await apiSaveLabs(payload);
    } catch (e) {
        return alert("Не удалось сохранить лабы");
    }
    await updateLabsCache();
    renderCharts();
    let modal = bootstrap.Modal.getInstance(document.getElementById('labsModal'));
    if (modal) modal.hide();
}

// ============================================================
//  КОМПАКТНАЯ ПАНЕЛЬ ДЕТАЛЕЙ (горизонтальный режим)
// ============================================================

function _renderLabStatsDetails() {
    const el = document.getElementById('labStatsDetails');
    if (!el) return;

    const validSubjects = new Set(
        cachedSchedule
            .filter(item => item.type_name === 'ЛЗ' || item.type_name === 'ПЗ')
            .map(item => `${item.lesson} (${item.type_name})`)
    );

    const items = Object.keys(cachedLabs || {})
        .filter(subj => validSubjects.has(subj) && cachedLabs[subj].total > 0)
        .sort((a, b) => a.localeCompare(b, 'ru'));

    if (items.length === 0) {
        el.innerHTML = '<div class="text-muted small">Нет данных</div>';
        return;
    }

    let html = '';
    items.forEach(subj => {
        const data = cachedLabs[subj];
        html += `
            <div class="widget-details-row" title="${escapeHtml(subj)}">
                <span class="widget-details-title">${escapeHtml(getDisplaySubjectKey(subj))}</span>
                <span class="widget-details-nums">${data.completed} / ${data.total}</span>
            </div>
        `;
    });
    el.innerHTML = html;
}

// ============================================================
//  ТЕМП СДАЧИ ЛАБ
// ------------------------------------------------------------
//  Сравнивает фактические сдачи с «планом»: сколько пар предмета
//  уже прошло — столько лаб и должно быть сдано (пропорционально).
//  До первой пары план = 0 (а не 1 — принудительная единица убрана).
// ============================================================

function renderLabPacing() {
    const container = document.getElementById('labPacingContent');
    if (!container) return;

    if (!cachedLabs || Object.keys(cachedLabs).length === 0) {
        container.innerHTML = '<div class="text-center text-muted small mt-2">Нет данных</div>';
        return;
    }

    let todayStr = getLocalDateStr(new Date());
    let scheduleStats = {};
    cachedSchedule.forEach(item => {
        if (item.type_name === 'ЛЗ' || item.type_name === 'ПЗ') {
            let subjKey = `${item.lesson} (${item.type_name})`;
            if (!scheduleStats[subjKey]) scheduleStats[subjKey] = { passed: 0, total: 0 };
            scheduleStats[subjKey].total++;
            if (item.date < todayStr) scheduleStats[subjKey].passed++;
        }
    });

    let validSubjects = new Set(Object.keys(scheduleStats));
    let html = '';
    let hasData = false;

    for (let subj in cachedLabs) {
        if (!validSubjects.has(subj)) continue;
        let data = cachedLabs[subj];
        if (data.total === 0) continue;
        hasData = true;

        let stats = scheduleStats[subj];
        let expectedCount = 0;
        if (stats.total > 0) {
            if (stats.passed >= stats.total) expectedCount = data.total;
            else expectedCount = Math.floor(data.total * stats.passed / stats.total);
        }
        if (expectedCount > data.total) expectedCount = data.total;
        if (expectedCount < 0) expectedCount = 0;

        const actualCount = data.completed;

        let level = 'is-empty';
        if (expectedCount > 0) {
            if (actualCount >= expectedCount) level = 'is-ok';
            else if (actualCount * 2 >= expectedCount) level = 'is-warn';
            else level = 'is-danger';
        } else if (actualCount > 0) {
            level = 'is-ok';
        }

        const displaySubj = getDisplaySubjectKey(subj);
        const safeSubj = escapeJsString(subj);

        html += `
            <div class="pacing-row" title="Открыть список лаб" onclick="openLabItemsModal('${safeSubj}')">
                <span class="pacing-row-title">${escapeHtml(displaySubj)}</span>
                <span class="pacing-row-counts ${level}">
                    <span class="pacing-num-actual">${actualCount}</span><span class="pacing-num-sep">/</span><span class="pacing-num-plan">${expectedCount}</span>
                </span>
            </div>
        `;
    }

    container.innerHTML = hasData
        ? html
        : '<div class="text-center text-muted small mt-2">Нет данных</div>';
}

;
// --- lab-items.js ---
// Поштучный список лаб/ПЗ по предмету: открыть модалку, отметить,
// переименовать, добавить, удалить последнюю.
//
// Использует cachedLabs (сводка) и cachedSchedule (для дат пар),
// поэтому должен грузиться после widgets.js и calendar.js.
// API-обёртки (api*LabItem) — из api.js.

let _labItemsCurrentSubject = null;
let _labItemsCurrentGroup = null;
let _labItemsCache = {};

// ============================================================
//  ДАТЫ ПАР ПО ПРЕДМЕТУ
// ============================================================

function _datesForSubject(subject) {
    const dates = [];
    cachedSchedule.forEach(item => {
        const key = `${item.lesson} (${item.type_name})`;
        if (key === subject && item.date) dates.push(item.date);
    });
    dates.sort();
    return dates;
}

// Примерная дата сдачи k-й лабы: k-я по счёту пара из списка.
// Если пар больше, чем лаб — берём ближайшую подходящую.
function _computeDueDate(dates, k, total) {
    if (!dates.length || total <= 0) return null;
    const M = dates.length;
    let idx = Math.ceil(k * M / total) - 1;
    if (idx < 0) idx = 0;
    if (idx >= M) idx = M - 1;
    return dates[idx];
}

// ============================================================
//  ОТКРЫТИЕ МОДАЛКИ
// ============================================================

async function openLabItemsModal(subjectKey) {
    const group = (document.getElementById('groupSelect').value || '').trim();
    if (!group) return;
    if (!cachedLabs[subjectKey] || cachedLabs[subjectKey].total === 0) {
        alert('У этого предмета нет лаб в расписании.');
        return;
    }

    _labItemsCurrentSubject = subjectKey;
    _labItemsCurrentGroup = group;

    const modalEl = document.getElementById('labItemsModal');
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);

    document.getElementById('labItemsModalTitle').textContent = getDisplaySubjectKey(subjectKey);
    document.getElementById('labItemsContent').innerHTML =
        '<div class="text-center text-muted small py-4">Загрузка…</div>';
    modal.show();

    await _reloadLabItems();
}

async function _reloadLabItems() {
    if (!_labItemsCurrentSubject || !_labItemsCurrentGroup) return;

    const subjectKey = _labItemsCurrentSubject;
    const group = _labItemsCurrentGroup;

    // Досоздаём недостающие записи: sync только в плюс, лишние не удаляет.
    const totalCount = (cachedLabs[subjectKey] && cachedLabs[subjectKey].total) || 0;
    if (totalCount > 0) {
        try {
            await apiSyncLabItems(group, [{ subject: subjectKey, count: totalCount }]);
        } catch (e) {
            console.error('[lab_items] sync failed', e);
        }
    }

    let grouped = {};
    try { grouped = await apiLoadLabItems(group); }
    catch (e) { grouped = {}; }

    const items = Array.isArray(grouped[subjectKey]) ? grouped[subjectKey] : [];

    const dates = _datesForSubject(subjectKey);
    const enriched = items.map(it => ({
        ...it,
        due_date: _computeDueDate(dates, it.idx, items.length || totalCount),
    }));

    _labItemsCache[subjectKey] = enriched;
    renderLabItemsList();
}

// ============================================================
//  РЕНДЕР СПИСКА
// ============================================================

function renderLabItemsList() {
    const container = document.getElementById('labItemsContent');
    if (!container) return;

    const subjectKey = _labItemsCurrentSubject;
    if (!subjectKey) return;

    const items = _labItemsCache[subjectKey] || [];
    const todayStr = getLocalDateStr(new Date());

    let html = `
        <div class="lab-items-toolbar">
            <div class="small text-muted">
                Всего: <b>${items.length}</b> · Сдано: <b>${items.filter(x => x.completed).length}</b>
            </div>
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-sm btn-outline-primary fw-bold"
                        onclick="onAddLabItem()" title="Добавить ещё одну лабу/ПЗ">+ Добавить</button>
                <button type="button" class="btn btn-sm btn-outline-danger fw-bold"
                        onclick="onRemoveLastLabItem()"
                        ${items.length === 0 ? 'disabled' : ''}
                        title="Удалить последнюю запись">🗑 Удалить последнюю</button>
            </div>
        </div>
    `;

    if (items.length === 0) {
        html += "<div class='text-center text-muted small py-4'>Записей нет. Нажмите «+ Добавить».</div>";
        container.innerHTML = html;
        return;
    }

    html += '<div class="lab-items-list">';

    items.forEach(it => {
        const overdue = !it.completed && it.due_date && it.due_date < todayStr;
        const dueLabel = it.due_date ? formatDateRu(it.due_date) : '—';
        const dueYear  = it.due_date ? it.due_date.slice(0, 4) : '';

        let rowCls = 'lab-item-row';
        if (it.completed) rowCls += ' lab-item-done';
        else if (overdue) rowCls += ' lab-item-overdue';

        html += `
            <div class="${rowCls}" data-id="${it.id}">
                <input type="checkbox" class="lab-item-check"
                       ${it.completed ? 'checked' : ''}
                       onchange="onLabItemToggle(${it.id}, this.checked)">
                <span class="lab-item-title"
                      onclick="onLabItemRename(${it.id}, this)"
                      title="Клик — переименовать">${escapeHtml(it.title)}</span>
                <span class="lab-item-due ${overdue ? 'is-overdue' : ''}"
                      title="${it.due_date ? 'Примерная дата сдачи' : 'Нет даты'}">
                    ${dueLabel}${dueYear ? ' ' + dueYear : ''}
                </span>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// ============================================================
//  ОБРАБОТЧИКИ
// ============================================================

async function onLabItemToggle(id, isCompleted) {
    try {
        await apiUpdateLabItem(id, { completed: isCompleted ? 1 : 0 });
    } catch (e) {
        console.error('[lab_items] update failed', e);
        alert('Не удалось сохранить');
        return;
    }
    const subjectKey = _labItemsCurrentSubject;
    if (subjectKey && _labItemsCache[subjectKey]) {
        const it = _labItemsCache[subjectKey].find(x => x.id === id);
        if (it) it.completed = isCompleted ? 1 : 0;
    }
    renderLabItemsList();
    await updateLabsCache();
    renderCharts();
}

async function onLabItemRename(id, el) {
    const subjectKey = _labItemsCurrentSubject;
    if (!subjectKey) return;
    const it = (_labItemsCache[subjectKey] || []).find(x => x.id === id);
    if (!it) return;

    const newTitle = prompt('Новое название:', it.title);
    if (newTitle === null) return;
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === it.title) return;

    try {
        await apiUpdateLabItem(id, { title: trimmed });
    } catch (e) {
        console.error('[lab_items] rename failed', e);
        alert('Не удалось переименовать');
        return;
    }
    it.title = trimmed;
    renderLabItemsList();
}

async function onAddLabItem() {
    if (!_labItemsCurrentSubject || !_labItemsCurrentGroup) return;
    try {
        await apiAddLabItem(_labItemsCurrentGroup, _labItemsCurrentSubject);
    } catch (e) {
        console.error('[lab_items] add failed', e);
        alert('Не удалось добавить');
        return;
    }
    await updateLabsCache();
    await _reloadLabItems();
    renderCharts();
}

async function onRemoveLastLabItem() {
    if (!_labItemsCurrentSubject || !_labItemsCurrentGroup) return;
    const items = _labItemsCache[_labItemsCurrentSubject] || [];
    if (items.length === 0) return;

    const last = items[items.length - 1];
    if (!confirm(`Удалить последнюю запись — «${last.title}»?`)) return;

    try {
        await apiRemoveLastLabItem(_labItemsCurrentGroup, _labItemsCurrentSubject);
    } catch (e) {
        console.error('[lab_items] remove_last failed', e);
        alert('Не удалось удалить');
        return;
    }
    await updateLabsCache();
    await _reloadLabItems();
    renderCharts();
}

;
// --- widgets.js ---
// Общие функции виджетов: кэш лаб, отрисовка графиков, тема графиков.
// showStats / showLabs / renderLabsContent / saveAllLabs / renderLabPacing —
// в widgets-stats.js и widgets-labs.js.
// Лаб-айтемы — в lab-items.js.

async function updateLabsCache() {
    const group = document.getElementById("groupSelect").value.trim();
    if (!group) return;
    try { cachedLabs = await apiLoadLabs(group); }
    catch (e) { cachedLabs = {}; }
}

function _setCanvasInitialSize(canvasEl) {
    if (!canvasEl) return;
    const parent = canvasEl.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w > 0 && h > 0) {
        canvasEl.width = w;
        canvasEl.height = h;
        canvasEl.style.width = w + 'px';
        canvasEl.style.height = h + 'px';
    }
}

function renderCharts() {
    if (typeof Chart === 'undefined') return;
    const cPassed = getThemeColor('--chart-passed', '#6366f1');
    const cRemaining = getThemeColor('--chart-remaining', '#cbd5e1');
    const cLabDone = getThemeColor('--chart-lab-done', '#14b8a6');
    const cLabLeft = getThemeColor('--chart-lab-left', '#f59e0b');
    const cText = getThemeColor('--text-secondary', '#64748b');
    const cTooltipBg = getThemeColor('--chart-tooltip-bg', 'rgba(15, 23, 42, 0.92)');
    const cTooltipTx = getThemeColor('--chart-tooltip-text', '#f8fafc');
    const cBorder = getThemeColor('--border-color', '#e2e8f0');
    const tooltipOpts = {
        backgroundColor: cTooltipBg,
        titleColor: cTooltipTx,
        bodyColor: cTooltipTx,
        borderColor: cBorder,
        borderWidth: 1,
        padding: 8,
        cornerRadius: 6,
        displayColors: false
    };

    let passed = 0, remaining = 0;
    let todayStr = getLocalDateStr(new Date());
    cachedSchedule.forEach(item => { item.date < todayStr ? passed++ : remaining++; });

    const canvas1 = document.getElementById('globalStatsChart');
    if (canvas1) {
        if (globalChart) {
            globalChart.data.datasets[0].data = [passed, remaining];
            globalChart.data.datasets[0].backgroundColor = [cPassed, cRemaining];
            globalChart.options.plugins.legend.labels.color = cText;
            globalChart.options.plugins.tooltip = Object.assign({}, globalChart.options.plugins.tooltip, tooltipOpts);
            globalChart.update('none');
        } else {
            _setCanvasInitialSize(canvas1);
            globalChart = new Chart(canvas1.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Прошло', 'Осталось'],
                    datasets: [{ data: [passed, remaining], backgroundColor: [cPassed, cRemaining], borderWidth: 0 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 250 },
                    plugins: {
                        legend: { position: 'bottom', labels: { color: cText } },
                        tooltip: tooltipOpts
                    }
                }
            });
        }
    }

    let labItems = cachedSchedule.filter(item => item.type_name === 'ЛЗ' || item.type_name === 'ПЗ');
    let validSubjects = new Set(labItems.map(item => `${item.lesson} (${item.type_name})`));
    let totLabs = 0, compLabs = 0;
    for (let subj in cachedLabs) {
        if (!validSubjects.has(subj)) continue;
        totLabs += cachedLabs[subj].total;
        compLabs += cachedLabs[subj].completed;
    }
    let uncompLabs = Math.max(0, totLabs - compLabs);
    let labData = totLabs === 0 ? [0, 1] : [compLabs, uncompLabs];
    let labColors = totLabs === 0 ? [cRemaining, cRemaining] : [cLabDone, cLabLeft];
    let labLabels = totLabs === 0 ? ['Нет данных', ''] : ['Сдано', 'Осталось'];

    const canvas2 = document.getElementById('labStatsChart');
    if (canvas2) {
        if (globalLabChart) {
            globalLabChart.data.datasets[0].data = labData;
            globalLabChart.data.datasets[0].backgroundColor = labColors;
            globalLabChart.data.labels = labLabels;
            globalLabChart.options.plugins.legend.labels.color = cText;
            globalLabChart.options.plugins.tooltip = Object.assign({}, globalLabChart.options.plugins.tooltip, tooltipOpts);
            globalLabChart.update('none');
        } else {
            _setCanvasInitialSize(canvas2);
            globalLabChart = new Chart(canvas2.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: labLabels,
                    datasets: [{ data: labData, backgroundColor: labColors, borderWidth: 0 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 250 },
                    plugins: {
                        legend: { position: 'bottom', labels: { color: cText } },
                        tooltip: tooltipOpts
                    }
                }
            });
        }
    }

    if (typeof _renderGlobalStatsDetails === 'function') _renderGlobalStatsDetails();
    if (typeof _renderLabStatsDetails === 'function') _renderLabStatsDetails();
    if (typeof renderLabPacing === 'function') renderLabPacing();
}

function refreshChartsTheme() {
    if (typeof globalChart !== 'undefined' && globalChart) {
        try { globalChart.destroy(); } catch (e) {}
        globalChart = null;
    }
    if (typeof globalLabChart !== 'undefined' && globalLabChart) {
        try { globalLabChart.destroy(); } catch (e) {}
        globalLabChart = null;
    }
    if (typeof cachedSchedule !== 'undefined' && Array.isArray(cachedSchedule) && cachedSchedule.length > 0) {
        try { renderCharts(); } catch (e) {}
    }
}

;
// --- settings.js ---
// Модальное окно настроек + экспорт/импорт.

const SETTINGS_SECTIONS_KEY = 'settingsSections_v1';
const SETTINGS_SECTIONS_NAMES = ['display', 'widgets', 'status', 'notif'];
const THEMES = ['light', 'dark', 'forest', 'sunset', 'ocean', 'hedgehog',
                'southpark', 'anime', 'oled', 'oled-warm'];

function initSettings() {
    if (typeof migrateLegacyStorageIfNeeded === 'function') {
        migrateLegacyStorageIfNeeded()
            .catch(e => console.warn('[settings] migrate failed', e));
    }

    applyTheme();
    applyWidgetVisibility();
    if (typeof applyFriendsTeachersVisibility === 'function') applyFriendsTeachersVisibility();
    if (typeof initNotesWidget === 'function') initNotesWidget();
    if (typeof initWidgetDragAndDrop === 'function') initWidgetDragAndDrop();
}

function openSettingsModal() {
    document.getElementById('settingsToggleTeacher').checked  = showTeacher;
    document.getElementById('settingsToggleLocation').checked = showLocation;
    document.getElementById('settingsToggleFriends').checked  = showFriends;
    document.getElementById('settingsToggleStatus').checked   = showStatus;

    document.getElementById('settingsToggleWidgetMiniCal').checked   = showWidgetMiniCal;
    document.getElementById('settingsToggleWidgetGlobal').checked    = showWidgetGlobal;
    document.getElementById('settingsToggleWidgetLabs').checked      = showWidgetLabs;
    document.getElementById('settingsToggleWidgetPacing').checked    = showWidgetPacing;
    document.getElementById('settingsToggleWidgetSuggestions').checked = showWidgetSuggestions;
    document.getElementById('settingsToggleWidgetNotes1').checked    = showWidgetNotes1;
    document.getElementById('settingsToggleWidgetNotes2').checked    = showWidgetNotes2;
    document.getElementById('settingsToggleWidgetNotes3').checked    = showWidgetNotes3;

    document.getElementById('settingsStatusFormat').value    = statusFormat;
    document.getElementById('settingsStatusPrecision').value = statusPrecision;

    document.getElementById('settingsNotifEnabled').checked = notificationsEnabled;
    document.getElementById('settingsNotifAdvance').value   = notificationAdvance;
    document.getElementById('settingsNotifUnit').value      = notificationUnit;
    document.getElementById('settingsTheme').value          = theme;

    updateNotificationsHint();
    restoreSettingsSections();

    let modalEl = document.getElementById('settingsModal');
    let modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.show();
}

function loadSettingsSections() {
    try {
        const raw = localStorage.getItem(SETTINGS_SECTIONS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
}

function saveSettingsSections(state) {
    try { localStorage.setItem(SETTINGS_SECTIONS_KEY, JSON.stringify(state)); } catch (e) {}
}

function toggleSettingsSection(name) {
    const body  = document.getElementById('settings-section-' + name);
    const arrow = document.getElementById('settings-arrow-' + name);
    if (!body) return;
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
    if (arrow) arrow.textContent = isHidden ? '▾' : '▸';
    const state = loadSettingsSections();
    state[name] = isHidden ? 'open' : 'closed';
    saveSettingsSections(state);
}

function restoreSettingsSections() {
    const state = loadSettingsSections();
    SETTINGS_SECTIONS_NAMES.forEach(name => {
        const body  = document.getElementById('settings-section-' + name);
        const arrow = document.getElementById('settings-arrow-' + name);
        if (!body) return;
        const isOpen = state[name] === 'open';
        body.style.display = isOpen ? 'block' : 'none';
        if (arrow) arrow.textContent = isOpen ? '▾' : '▸';
    });
}

function saveSettingsFromUI() {
    showTeacher  = document.getElementById('settingsToggleTeacher').checked;
    showLocation = document.getElementById('settingsToggleLocation').checked;
    showFriends  = document.getElementById('settingsToggleFriends').checked;
    showStatus   = document.getElementById('settingsToggleStatus').checked;

    localStorage.setItem('showTeacher',  showTeacher);
    localStorage.setItem('showLocation', showLocation);
    localStorage.setItem('showFriends',  showFriends);
    localStorage.setItem('showStatus',   showStatus);

    showWidgetMiniCal        = document.getElementById('settingsToggleWidgetMiniCal').checked;
    showWidgetGlobal         = document.getElementById('settingsToggleWidgetGlobal').checked;
    showWidgetLabs           = document.getElementById('settingsToggleWidgetLabs').checked;
    showWidgetPacing         = document.getElementById('settingsToggleWidgetPacing').checked;
    showWidgetSuggestions    = document.getElementById('settingsToggleWidgetSuggestions').checked;
    showWidgetNotes1         = document.getElementById('settingsToggleWidgetNotes1').checked;
    showWidgetNotes2         = document.getElementById('settingsToggleWidgetNotes2').checked;
    showWidgetNotes3         = document.getElementById('settingsToggleWidgetNotes3').checked;

    localStorage.setItem('showWidgetMiniCal', showWidgetMiniCal);
    localStorage.setItem('showWidgetGlobal',  showWidgetGlobal);
    localStorage.setItem('showWidgetLabs',    showWidgetLabs);
    localStorage.setItem('showWidgetPacing',  showWidgetPacing);
    localStorage.setItem('showWidgetSuggestions', showWidgetSuggestions);
    localStorage.setItem('showWidgetNotes1',  showWidgetNotes1);
    localStorage.setItem('showWidgetNotes2',  showWidgetNotes2);
    localStorage.setItem('showWidgetNotes3',  showWidgetNotes3);

    applyWidgetVisibility();

    statusFormat = document.getElementById('settingsStatusFormat').value;
    if (!['interval', 'both', 'time'].includes(statusFormat)) statusFormat = 'interval';
    localStorage.setItem('statusFormat', statusFormat);

    let p = document.getElementById('settingsStatusPrecision').value;
    if (!['min', 'sec', 'cs'].includes(p)) p = 'min';
    statusPrecision = p;
    localStorage.setItem('statusPrecision', statusPrecision);

    notificationsEnabled = document.getElementById('settingsNotifEnabled').checked;

    let adv = parseInt(document.getElementById('settingsNotifAdvance').value, 10);
    if (isNaN(adv) || adv < 1) adv = 1;
    if (adv > 60) adv = 60;
    notificationAdvance = adv;
    document.getElementById('settingsNotifAdvance').value = adv;

    let unit = document.getElementById('settingsNotifUnit').value;
    if (!['min', 'hour', 'day', 'week'].includes(unit)) unit = 'min';
    notificationUnit = unit;

    localStorage.setItem('notificationsEnabled', notificationsEnabled ? 'true' : 'false');
    localStorage.setItem('notificationAdvance', String(notificationAdvance));
    localStorage.setItem('notificationUnit', notificationUnit);

    theme = document.getElementById('settingsTheme').value;
    if (!THEMES.includes(theme)) theme = 'light';
    localStorage.setItem('theme', theme);
    applyTheme();

    renderCalendar();
    updateScheduleStatus();
    restartStatusTimer();
    refreshNotifications();
    if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications();
    updateNotificationsHint();
}

function restartStatusTimer() {
    if (_statusIntervalId) { clearInterval(_statusIntervalId); _statusIntervalId = null; }
    _statusIntervalId = setInterval(updateScheduleStatus, getStatusTickMs());
}

async function handleNotificationsToggle(checkbox) {
    if (checkbox.checked) {
        let result = await requestNotificationPermission();
        if (result !== 'granted') {
            checkbox.checked = false;
            notificationsEnabled = false;
            localStorage.setItem('notificationsEnabled', 'false');
            updateNotificationsHint();
            return;
        }
        if (typeof window.EzhNative !== 'undefined'
                && typeof window.EzhNative.canScheduleExactAlarms === 'function') {
            try {
                if (!window.EzhNative.canScheduleExactAlarms()) {
                    setTimeout(() => {
                        if (confirm(
                            'Для точных напоминаний (например, «за 15 минут до пары») ' +
                            'системе нужно разрешение на точные будильники.\n\n' +
                            'Открыть настройки?\n\n' +
                            'Если отказаться — напоминания всё равно придут, но ' +
                            'могут сработать с задержкой в несколько минут.'
                        )) {
                            window.EzhNative.requestExactAlarmPermission();
                        }
                    }, 200);
                }
            } catch (e) {}
        }
    }
    saveSettingsFromUI();
}

function _nativeNotifPermissionGranted() {
    if (typeof window.EzhNative === 'undefined' || window.EzhNative === null) return null;
    try { return window.EzhNative.hasNotificationPermission() === true; }
    catch (e) { return false; }
}

function _nativeExactAlarmGranted() {
    if (typeof window.EzhNative === 'undefined' || window.EzhNative === null) return null;
    if (typeof window.EzhNative.canScheduleExactAlarms !== 'function') return null;
    try { return window.EzhNative.canScheduleExactAlarms() === true; }
    catch (e) { return false; }
}

function updateNotificationsHint() {
    let hint = document.getElementById('settingsNotifHint');
    if (!hint) return;

    const nativeGranted = _nativeNotifPermissionGranted();
    const advanceText = formatAdvanceText(notificationAdvance, notificationUnit);

    if (nativeGranted !== null) {
        if (!nativeGranted && notificationsEnabled) {
            hint.style.display = 'block';
            hint.textContent = 'Нужно разрешить уведомления в системе — ' +
                'приложение запросит его при следующем открытии.';
            return;
        }
        if (!notificationsEnabled) { hint.style.display = 'none'; return; }

        const exact = _nativeExactAlarmGranted();
        if (exact === false) {
            hint.style.display = 'block';
            hint.textContent =
                `Напоминания включены (за ${advanceText}). Однако системное ` +
                'разрешение на точные будильники не выдано — Android может ' +
                'отложить уведомление на несколько минут. Разрешение можно ' +
                'выдать в системных настройках приложения «Будильники и напоминания».';
        } else {
            hint.style.display = 'block';
            hint.textContent = `Готово. Напомним за ${advanceText} до начала ` +
                'события — уведомления работают, даже если приложение закрыто.';
        }
        return;
    }

    if (!('Notification' in window)) {
        hint.style.display = 'block';
        hint.textContent = 'Ваш браузер не поддерживает уведомления.';
        return;
    }
    let perm = Notification.permission;
    if (perm === 'denied') {
        hint.style.display = 'block';
        hint.textContent = 'Уведомления запрещены в настройках браузера. ' +
            'Разрешите их для этого сайта вручную.';
    } else if (perm === 'default' && notificationsEnabled) {
        hint.style.display = 'block';
        hint.textContent = 'Нужно разрешить уведомления — нажмите на переключатель ещё раз.';
    } else if (perm === 'granted' && notificationsEnabled) {
        hint.style.display = 'block';
        hint.textContent = `Готово. Напомним за ${advanceText} до начала события, ` +
            'пока вкладка открыта.';
    } else {
        hint.style.display = 'none';
    }
}

function applyTheme() {
    const prevTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme',
        theme === 'dark' ? 'dark' : 'light');
    if (prevTheme !== theme && typeof refreshChartsTheme === 'function') refreshChartsTheme();
}

// ------------------------------------------------------------
//  Сохранение текстового файла: WebView → EzhNative, браузер → blob
// ------------------------------------------------------------
function _saveTextFile(filename, mime, text) {
    if (typeof window.EzhNative !== 'undefined'
            && typeof window.EzhNative.saveFileFromText === 'function') {
        const result = window.EzhNative.saveFileFromText(filename, mime, text);
        if (!result) throw new Error('Не удалось сохранить файл');
        // content://... — это MediaStore.Downloads (Android 10+):
        // файл реально лежит в системных Загрузках.
        // /data/.../files/... — приватная папка приложения (API < 29
        // или fallback при ошибке MediaStore). Пользователю её в
        // «Загрузках» не видно — не врём.
        if (String(result).startsWith('content://')) {
            showUpdateNotification('✅ Файл сохранён в «Загрузки»');
        } else {
            showUpdateNotification('✅ Файл сохранён в папку приложения');
        }
        return;
    }
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
    showUpdateNotification('✅ Файл сохранён');
}

// Сетевые вызовы идут через _fetchWithTimeout из api.js (таймаут 30 с).
async function downloadICS() {
    const group    = (document.getElementById('groupSelect').value || '').trim();
    const subgroup = document.getElementById('subgroupSelect').value || '0';
    if (!group) { alert('Сначала выберите группу!'); return; }

    showGlobalLoader('📅 Готовим .ics-файл...');
    try {
        const url = `/api/schedule.ics?group=${encodeURIComponent(group)}` +
                    `&subgroup=${encodeURIComponent(subgroup)}`;
        const resp = await _fetchWithTimeout(_api(url));
        if (!resp.ok) {
            if (resp.status === 409) {
                let text = '';
                try { text = await resp.text(); } catch (e) {}
                throw new Error(text || 'Расписание ещё не загружено.');
            }
            if (resp.status === 429) throw new Error('Слишком часто. Подождите минуту.');
            throw new Error(`HTTP ${resp.status}`);
        }
        let filename = `schedule_${group.replace(/[\/\\:*?"<>|]/g, '_')}_${subgroup}.ics`;
        const cd = resp.headers.get('Content-Disposition') || '';
        let m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
        if (m && m[1]) {
            try { filename = decodeURIComponent(m[1]); } catch (e) {}
        } else {
            m = /filename="?([^";]+)"?/i.exec(cd);
            if (m && m[1]) filename = m[1];
        }
        // Санитизация ПОСЛЕ декодирования: Content-Disposition может
        // содержать «/» (группа ПИН/б-24-1-о), а MediaStore.Downloads
        // с таким DISPLAY_NAME создаёт вложенную папку или падает.
        filename = filename.replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').slice(0, 200);
        const text = await resp.text();
        _saveTextFile(filename, 'text/calendar', text);
    } catch (e) {
        console.error('[ics] download failed', e);
        showUpdateNotification(`❌ ${(e && e.message) || 'Не удалось собрать .ics'}`);
    } finally {
        hideGlobalLoader();
    }
}

async function downloadTasksICS() {
    showGlobalLoader('📝 Готовим .ics с заметками...');
    try {
        const resp = await _fetchWithTimeout(_api('/api/tasks.ics'));
        if (resp.status === 409) {
            let text = '';
            try { text = await resp.text(); } catch (e) {}
            throw new Error(text || 'Заметок пока нет.');
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        _saveTextFile('ezh_notes.ics', 'text/calendar', text);
    } catch (e) {
        console.error('[ics tasks] failed', e);
        showUpdateNotification(`❌ ${(e && e.message) || 'Не удалось собрать .ics'}`);
    } finally {
        hideGlobalLoader();
    }
}

// ------------------------------------------------------------
//  Резервная копия / восстановление
// ------------------------------------------------------------
async function downloadBackup() {
    showGlobalLoader('💾 Собираем резервную копию...');
    try {
        const resp = await _fetchWithTimeout(_api('/api/backup'));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const text = JSON.stringify(data, null, 2);
        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        _saveTextFile(`ezh_backup_${ts}.json`, 'application/json', text);
    } catch (e) {
        console.error('[backup] download failed', e);
        showUpdateNotification(`❌ ${(e && e.message) || 'Не удалось скачать копию'}`);
    } finally {
        hideGlobalLoader();
    }
}

function pickBackupFile() {
    const input = document.getElementById('backupFileInput');
    if (input) { input.value = ''; input.click(); }
}

async function onBackupFilePicked(input) {
    const file = input && input.files && input.files[0];
    if (!file) return;

    if (!confirm('Восстановление заменит текущие заметки, друзей, лабы, настройки ' +
                 'предметов, кастомное расписание и преподавателей.\n\nПродолжить?')) {
        return;
    }

    showGlobalLoader('📥 Читаем файл резервной копии...');
    try {
        const text = await file.text();
        let payload;
        try { payload = JSON.parse(text); }
        catch (e) { throw new Error('Файл не является валидным JSON'); }

        if (!payload || typeof payload !== 'object' || !payload.tables) {
            throw new Error('Это не похоже на резервную копию Ежедневника');
        }

        const resp = await _fetchWithTimeout(_api('/api/backup'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!resp.ok) {
            let msg = '';
            try {
                const j = await resp.json();
                msg = j && j.error ? j.error : '';
            } catch (e) {}
            throw new Error(msg || `HTTP ${resp.status}`);
        }

        showUpdateNotification('✅ Восстановлено. Перезагружаем…');
        setTimeout(() => location.reload(), 900);
    } catch (e) {
        console.error('[backup] restore failed', e);
        showUpdateNotification(`❌ ${(e && e.message) || 'Ошибка восстановления'}`);
    } finally {
        hideGlobalLoader();
    }
}

function applyWidgetVisibility() {
    const map = [
        ['widgetMiniCalCard',            showWidgetMiniCal],
        ['widgetGlobalCard',             showWidgetGlobal],
        ['widgetLabsCard',               showWidgetLabs],
        ['widgetPacingCard',             showWidgetPacing],
        ['widgetSuggestionsCard',        showWidgetSuggestions],
        ['widgetNotesCard1',             showWidgetNotes1],
        ['widgetNotesCard2',             showWidgetNotes2],
        ['widgetNotesCard3',             showWidgetNotes3],
        ['widgetLabsProCard',            showWidgetLabsPro],
        ['widgetMoodleAvgGradeCard',     showWidgetMoodleAvg],
        ['widgetMoodleSubjectGradesCard',showWidgetMoodleSubj],
    ];
    map.forEach(([id, visible]) => {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
    });
    if (typeof renderSuggestions === 'function' && showWidgetSuggestions) {
        try { renderSuggestions(false); } catch (e) {}
    }
}

// ------------------------------------------------------------
//  Кнопки-крестики в index.html вызывают hideWidget(cardId, toggleId).
//  Раньше функции не было — каждый клик падал с ReferenceError,
//  виджет не скрывался, консоль забивалась ошибками.
// ------------------------------------------------------------
function hideWidget(cardId, toggleId) {
    const card = document.getElementById(cardId);
    if (card) card.style.display = 'none';

    const toggle = document.getElementById(toggleId);
    if (toggle) {
        toggle.checked = false;
        // onchange в разметке ведёт на saveSettingsFromUI() — он
        // запишет флаг в localStorage и применит видимость.
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

;
// --- teachers.js ---
// Расписание преподавателей.
//
// Сетевые вызовы — через _fetchWithTimeout из api.js (таймаут 30 с).

let teachersAllList = null;
let trackedTeachers = [];
let teacherSchedulesCache = {};
let _teacherInitDone = false;
let _currentTeacherIndex = 0;

let _teachersOrderOverride = null;
let _teachersGeneration = 0;

// ============================================================
//  ПОРЯДОК
// ============================================================

function loadTeachersOrder() {
    if (Array.isArray(_teachersOrderOverride)) return _teachersOrderOverride.slice();
    try {
        const raw = localStorage.getItem('teachersOrder');
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function saveTeachersOrder() {
    const ids = trackedTeachers.map(t => t.id);
    _teachersOrderOverride = ids.slice();
    try {
        localStorage.setItem('teachersOrder', JSON.stringify(ids));
    } catch (e) {
        console.warn('[teachers] не удалось записать порядок в localStorage:', e);
    }
}

function applyTeachersOrder() {
    const order = loadTeachersOrder();
    if (!Array.isArray(order) || order.length === 0) return;
    trackedTeachers.sort((a, b) => {
        let ai = order.indexOf(a.id); if (ai === -1) ai = Number.MAX_SAFE_INTEGER;
        let bi = order.indexOf(b.id); if (bi === -1) bi = Number.MAX_SAFE_INTEGER;
        return ai - bi;
    });
}

// ============================================================
//  ПРОКРУТКА И ПЕРЕСТАНОВКА
// ============================================================

function rotateTeachersRight() {
    if (!Array.isArray(trackedTeachers) || trackedTeachers.length < 2) return;
    _currentTeacherIndex = (_currentTeacherIndex + 1) % trackedTeachers.length;
    renderTeachersCalendars();
}

function moveTeacherUp() {
    if (!Array.isArray(trackedTeachers) || trackedTeachers.length < 2) return;
    if (_currentTeacherIndex <= 0) return;
    _teachersGeneration++;
    const i = _currentTeacherIndex;
    [trackedTeachers[i - 1], trackedTeachers[i]] = [trackedTeachers[i], trackedTeachers[i - 1]];
    _currentTeacherIndex--;
    saveTeachersOrder();
    renderTeachersCalendars();
}

function moveTeacherDown() {
    if (!Array.isArray(trackedTeachers) || trackedTeachers.length < 2) return;
    if (_currentTeacherIndex >= trackedTeachers.length - 1) return;
    _teachersGeneration++;
    const i = _currentTeacherIndex;
    [trackedTeachers[i], trackedTeachers[i + 1]] = [trackedTeachers[i + 1], trackedTeachers[i]];
    _currentTeacherIndex++;
    saveTeachersOrder();
    renderTeachersCalendars();
}

// ============================================================
//  INIT
// ------------------------------------------------------------
//  Раньше здесь висели 900 мс «на всякий случай», чтобы не
//  конкурировать с fetchSemesterData. На практике это лишь
//  магия: initTeachers асинхронный (fetchTrackedTeachers не
//  зависит от расписания), а подсказки по ФИО строятся уже
//  при открытии модалки — к этому моменту cachedSchedule
//  гарантированно загружен. Запускаем сразу.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    if (_teacherInitDone) return;
    _teacherInitDone = true;
    initTeachers();
});

async function initTeachers() {
    await fetchTrackedTeachers();
    renderTeachersCalendars();
    fetchAllTeacherSchedules().then(() => renderTeachersCalendars());
}

// ============================================================
//  FETCH
// ============================================================

async function fetchTrackedTeachers() {
    const myGen = ++_teachersGeneration;

    let list = [];
    try {
        const resp = await _fetchWithTimeout(_api('/api/tracked_teachers'));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        list = await resp.json();
    } catch (e) {
        console.error('[teachers] load tracked failed', e);
        list = [];
    }

    if (myGen !== _teachersGeneration) return;

    trackedTeachers = Array.isArray(list) ? list : [];
    applyTeachersOrder();
    if (_currentTeacherIndex >= trackedTeachers.length) _currentTeacherIndex = 0;
}

async function fetchAllTeacherSchedules() {
    const promises = trackedTeachers.map(t => loadTeacherSchedule(t.slug));
    await Promise.all(promises);
}

async function loadTeacherSchedule(slug, force) {
    if (teacherSchedulesCache[slug] && !force) return teacherSchedulesCache[slug];
    try {
        const url = '/api/teacher_schedule?slug=' + encodeURIComponent(slug) + (force ? '&force=1' : '');
        const resp = await _fetchWithTimeout(_api(url));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        teacherSchedulesCache[slug] = Array.isArray(data) ? data : [];
        return teacherSchedulesCache[slug];
    } catch (e) {
        console.error('[teachers] schedule load failed', slug, e);
        teacherSchedulesCache[slug] = [];
        return [];
    }
}

// ============================================================
//  МОДАЛКА ДОБАВЛЕНИЯ
// ============================================================

async function showAddTeacherModal() {
    const inp = document.getElementById('teacherAddInput');
    const hint = document.getElementById('teacherAddHint');
    const sugg = document.getElementById('teacherAddSuggestions');
    if (inp) inp.value = '';
    if (hint) hint.textContent = 'Загрузка списка…';
    if (sugg) sugg.innerHTML = '';

    const modalEl = document.getElementById('addTeacherModal');
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.show();

    await ensureAllTeachersLoaded();
    renderTeacherSuggestions('');

    setTimeout(() => { if (inp) inp.focus(); }, 200);
}

function onTeacherSearchFocus() {
    if (!teachersAllList) return;
    const inp = document.getElementById('teacherAddInput');
    renderTeacherSuggestions(inp ? inp.value : '');
}

function onTeacherSearchInput(value) {
    renderTeacherSuggestions(value);
}

async function ensureAllTeachersLoaded() {
    if (teachersAllList && teachersAllList.length) return teachersAllList;
    try {
        const resp = await _fetchWithTimeout(_api('/api/teachers'));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        teachersAllList = await resp.json();
    } catch (e) {
        console.error('[teachers] load all failed', e);
        teachersAllList = [];
    }
    return teachersAllList;
}

// ------------------------------------------------------------
//  УМНЫЕ ПОДСКАЗКИ:
//   • если поле пустое — сначала показываем преподавателей,
//     которые уже ведут пары у вашей группы (по фамилии);
//   • если запрос короткий (<2 символов) — «Введите минимум 2»;
//   • иначе — обычный поиск по подстроке.
// ------------------------------------------------------------

function getMyGroupSurnames() {
    const surnames = new Set();
    if (!Array.isArray(cachedSchedule)) return surnames;
    cachedSchedule.forEach(item => {
        const t = (item.teacher || '').trim();
        if (!t) return;
        const first = t.split(/\s+/)[0];
        if (first && first.length >= 3) surnames.add(first.toLowerCase());
    });
    return surnames;
}

function renderTeacherSuggestions(query) {
    const container = document.getElementById('teacherAddSuggestions');
    const hint = document.getElementById('teacherAddHint');
    if (!container) return;

    if (!teachersAllList || teachersAllList.length === 0) {
        container.innerHTML = '<div class="text-center text-muted small py-3">Список преподавателей загружается…</div>';
        if (hint) hint.textContent = '';
        return;
    }

    const q = (query || '').trim().toLowerCase();
    const trackedSlugs = new Set(trackedTeachers.map(t => t.slug));

    let filtered;
    let mode;

    if (!q) {
        const mySurnames = getMyGroupSurnames();
        if (mySurnames.size > 0) {
            filtered = teachersAllList.filter(t => {
                const first = (t.name || '').split(/\s+/)[0].toLowerCase();
                return first && mySurnames.has(first);
            });
            mode = 'mine';
            if (filtered.length === 0) {
                filtered = teachersAllList.slice(0, 30);
                mode = 'all';
            }
        } else {
            filtered = teachersAllList.slice(0, 30);
            mode = 'all';
        }
    } else if (q.length < 2) {
        filtered = [];
        mode = 'short';
    } else {
        filtered = teachersAllList.filter(t => (t.name || '').toLowerCase().includes(q)).slice(0, 50);
        mode = 'search';
    }

    if (hint) {
        if (mode === 'mine') hint.textContent = `Ваши преподаватели (${filtered.length}). Начните вводить фамилию — найдём среди всех.`;
        else if (mode === 'search') hint.textContent = `Найдено: ${filtered.length}`;
        else if (mode === 'short') hint.textContent = 'Введите минимум 2 символа';
        else hint.textContent = `Всего: ${teachersAllList.length}. Показаны первые ${filtered.length}. Начните вводить фамилию для поиска.`;
    }

    if (filtered.length === 0) {
        container.innerHTML = mode === 'short'
            ? '<div class="text-center text-muted small py-3">—</div>'
            : '<div class="text-center text-muted small py-3">Ничего не найдено</div>';
        return;
    }

    const parts = [];
    filtered.forEach(t => {
        const isTracked = trackedSlugs.has(t.slug);
        const cls = isTracked ? ' teacher-suggestion-disabled' : '';
        const clickAttr = isTracked ? '' : `onclick="addTrackedTeacher('${escapeJsString(t.slug)}', '${escapeJsString(t.name)}')"`;
        const badge = isTracked ? '<span class="teacher-suggestion-badge">добавлен</span>' : '<span class="teacher-suggestion-arrow">+</span>';
        parts.push(`<div class="teacher-suggestion${cls}" ${clickAttr}><span class="teacher-suggestion-name">${escapeHtml(t.name)}</span>${badge}</div>`);
    });
    container.innerHTML = parts.join('');
}

async function addTrackedTeacher(slug, name) {
    let newId = null;
    try {
        const resp = await _fetchWithTimeout(_api('/api/tracked_teachers'), {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, slug})
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data && data.id) newId = data.id;
    } catch (e) {
        console.error('[teachers] add failed', e);
        alert('Не удалось добавить преподавателя');
        return;
    }

    const modalEl = document.getElementById('addTeacherModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    await fetchTrackedTeachers();

    if (newId !== null) {
        const order = loadTeachersOrder() || [];
        if (Array.isArray(order) && !order.includes(newId)) {
            order.push(newId);
            _teachersOrderOverride = order.slice();
            try { localStorage.setItem('teachersOrder', JSON.stringify(order)); } catch (e) {}
        }
    }

    renderTeachersCalendars();
    loadTeacherSchedule(slug).then(() => renderTeachersCalendars());

    if (typeof showUpdateNotification === 'function') showUpdateNotification(`Добавлен: ${name}`);
}

async function deleteTrackedTeacher(id) {
    const teacher = trackedTeachers.find(t => t.id === id);
    if (!teacher) return;
    if (!confirm(`Убрать преподавателя «${teacher.name}» из списка?`)) return;

    try {
        const resp = await _fetchWithTimeout(_api('/api/tracked_teachers/' + id), {method: 'DELETE'});
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
    } catch (e) {
        console.error('[teachers] delete failed', e);
        alert('Не удалось удалить');
        return;
    }

    delete teacherSchedulesCache[teacher.slug];
    if (_currentTeacherIndex >= trackedTeachers.length - 1 && _currentTeacherIndex > 0) _currentTeacherIndex--;

    const order = loadTeachersOrder();
    if (Array.isArray(order)) {
        const idx = order.indexOf(id);
        if (idx !== -1) {
            order.splice(idx, 1);
            _teachersOrderOverride = order.slice();
            try { localStorage.setItem('teachersOrder', JSON.stringify(order)); } catch (e) {}
        }
    }

    await fetchTrackedTeachers();
    renderTeachersCalendars();
}

// ============================================================
//  ОБЩИЕ ПАРЫ (с моей группой)
// ============================================================

function _countCommonPairsForTeacher(teacherDayPairs, myDaySchedule) {
    const myGroup = (document.getElementById('groupSelect')?.value || '').trim().toUpperCase();
    if (!myGroup || !teacherDayPairs.length || !myDaySchedule.length) return 0;

    let count = 0;
    teacherDayPairs.forEach(p => {
        if (!Array.isArray(p.groups)) return;
        const hasMyGroup = p.groups.some(g => String(g).toUpperCase() === myGroup);
        if (!hasMyGroup) return;
        const timeMatch = myDaySchedule.find(m => m.time_range === p.time_range);
        if (timeMatch) count++;
    });
    return count;
}

// ============================================================
//  РЕНДЕР КАЛЕНДАРЯ ПРЕПОДАВАТЕЛЯ (одного)
// ============================================================

function toggleTeacherPairDetails(cardEl) {
    if (!cardEl) return;
    const details = cardEl.querySelector('.teacher-pair-details');
    if (!details) return;
    details.hidden = !details.hidden;
    cardEl.classList.toggle('is-details-open', !details.hidden);
}

function renderTeachersCalendars() {
    const container = document.getElementById('teachersCalendarsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!trackedTeachers || trackedTeachers.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎓</div><div class="empty-state-title">Пока никого нет</div><div class="empty-state-text">Нажмите «+».</div></div>`;
        return;
    }

    if (_currentTeacherIndex >= trackedTeachers.length) _currentTeacherIndex = 0;
    const teacher = trackedTeachers[_currentTeacherIndex];
    const pairs = teacherSchedulesCache[teacher.slug] || [];
    const isLoading = !(teacher.slug in teacherSchedulesCache);
    const realTodayStr = getLocalDateStr(new Date());

    const wrapper = document.createElement('div');
    wrapper.className = 'teacher-wrapper bg-white rounded shadow-sm px-2 pb-2 pt-1';

    const isFirst = _currentTeacherIndex === 0;
    const isLast  = _currentTeacherIndex === trackedTeachers.length - 1;

    const header = document.createElement('div');
    header.className = 'fw-bold text-primary mb-2 ps-1 pt-1 teacher-header-row d-flex align-items-center justify-content-between';
    header.innerHTML = `
        <span>🎓 ${escapeHtml(teacher.name)}</span>
        <div class="d-flex align-items-center gap-1">
            <span class="text-muted small me-1">${_currentTeacherIndex + 1} / ${trackedTeachers.length}</span>
            <button class="btn btn-sm btn-link text-secondary p-0 text-decoration-none" style="width: 20px;" title="Выше" onclick="moveTeacherUp()" ${isFirst ? 'disabled' : ''}>↑</button>
            <button class="btn btn-sm btn-link text-secondary p-0 me-1 text-decoration-none" style="width: 20px;" title="Ниже" onclick="moveTeacherDown()" ${isLast ? 'disabled' : ''}>↓</button>
            <button class="btn btn-sm btn-link text-primary p-0 me-2 text-decoration-none" onclick="teacherRefresh('${escapeJsString(teacher.slug)}')">🔄</button>
            <button class="btn btn-sm btn-link text-danger p-0 text-decoration-none" onclick="deleteTrackedTeacher(${teacher.id})">🗑️</button>
        </div>`;
    wrapper.appendChild(header);

    if (isLoading) {
        wrapper.innerHTML += '<div class="text-center text-muted small py-3">Загрузка…</div>';
        container.appendChild(wrapper);
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'calendar-grid w-100';
    const dayParts = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(currentBaseDate); d.setDate(d.getDate() + i);
        const dateStr = getLocalDateStr(d);
        const displayDate = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' });
        const dayPairs = pairs.filter(p => p.date === dateStr).sort((a, b) => (a.n || 0) - (b.n || 0));
        const myDaySchedule = cachedSchedule.filter(p => p.date === dateStr);
        const isToday = dateStr === realTodayStr ? ' day-today' : '';
        let html = `<div class="teacher-col${isToday}"><div class="teacher-day-header">${displayDate}</div>`;

        if (dayPairs.length > 0) {
            // Бейдж общих пар — общее количество за день
            const commonCount = _countCommonPairsForTeacher(dayPairs, myDaySchedule);
            if (commonCount > 0) {
                html += `<div class="shared-class shared-common fw-bold mb-1" style="font-size:0.7em;">🤝 ${commonCount} ${plural(commonCount, 'общая пара', 'общие пары', 'общих пар')}</div>`;
            }
            dayPairs.forEach(p => {
                const badge = p.type_name
                    ? `<span class="badge bg-secondary ms-1" style="font-size:0.6em;">${escapeHtml(p.type_name)}</span>`
                    : '';
                const locHtml = p.location ? `<div class="teacher-pair-location">🚪 ${escapeHtml(p.location)}</div>` : '';
                const groupsHtml = (p.groups && p.groups.length)
                    ? `<div class="text-muted" style="font-size:0.85em;">${p.groups.map(g => escapeHtml(g)).join(', ')}</div>`
                    : '';

                html += `
                    <div class="teacher-pair-card" onclick="toggleTeacherPairDetails(this)" title="Показать/скрыть подробности">
                        <div class="teacher-pair-head">
                            <strong class="text-primary">${escapeHtml(p.time_range)}</strong>${badge}
                            <span class="teacher-pair-toggle">▼</span>
                        </div>
                        ${locHtml}
                        <div class="teacher-pair-details" hidden>
                            <div>${escapeHtml(p.lesson)}</div>
                            ${groupsHtml}
                        </div>
                    </div>`;
            });
        } else {
            html += '<div class="text-muted text-center mt-2" style="font-size:0.8em;">—</div>';
        }
        html += `</div>`;
        dayParts.push(html);
    }
    grid.innerHTML = dayParts.join('');
    wrapper.appendChild(grid);
    container.appendChild(wrapper);
}

async function teacherRefresh(slug) {
    await loadTeacherSchedule(slug, true);
    renderTeachersCalendars();
    if (typeof showUpdateNotification === 'function') showUpdateNotification('Расписание преподавателя обновлено');
}

;
// --- search.js ---
// Глобальный поиск: инлайн-поле в шапке + модалка (fallback для Ctrl+K).
// v3.19.0: инлайн-поле живёт в компактной шапке (#globalSearchInput),
// результаты — position:absolute под шапкой, ширина клампится по вьюпорту.

let _searchDebounceTimer = null;
let _searchResults = { tasks: [], events: [] };
let _searchLastQuery = '';

const _searchMeta = { count: 0, query: '' };

// === Инлайн-поиск в шапке ===
let _inlineSearchDebounce = null;
let _inlineSearchQuery = '';
let _inlineSearchDropdown = null;

function initInlineSearch() {
    const input = document.getElementById('globalSearchInput');
    if (!input) return;

    if (!_inlineSearchDropdown) {
        _inlineSearchDropdown = document.createElement('div');
        _inlineSearchDropdown.id = 'globalSearchResults';
        _inlineSearchDropdown.className = 'autocomplete-list';
        _inlineSearchDropdown.style.position = 'absolute';
        document.body.appendChild(_inlineSearchDropdown);
    }
    const dropdown = _inlineSearchDropdown;

    function position() {
        const rect = input.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const width = Math.min(vw - 16, Math.max(rect.width, 320));
        let left = rect.left;
        if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
        dropdown.style.left = left + 'px';
        dropdown.style.top = (rect.bottom + 2) + 'px';
        dropdown.style.width = width + 'px';
    }
    function hide() { dropdown.style.display = 'none'; }
    function show() { position(); dropdown.style.display = 'block'; }

    async function fetchAndRender(query) {
        try {
            const data = await apiSearch(query);
            if (_inlineSearchQuery !== query) return;
            _renderInlineResults(data, query);
            show();
        } catch (e) {
            console.error('[inline-search] failed', e);
        }
    }

    function _renderInlineResults(data, q) {
        const tasks  = Array.isArray(data.tasks)  ? data.tasks  : [];
        const events = Array.isArray(data.events) ? data.events : [];

        if (tasks.length === 0 && events.length === 0) {
            dropdown.innerHTML = `<div class="autocomplete-item autocomplete-empty">Ничего не найдено по «${escapeHtml(q)}»</div>`;
            return;
        }

        let html = '';
        if (tasks.length > 0) {
            html += `<div class="search-section-title" style="padding: 6px 14px 2px; margin: 0;">📝 Заметки</div>`;
            tasks.slice(0, 5).forEach(t => {
                html += `<div class="autocomplete-item" data-date="${escapeAttr(t.date)}" style="display: flex; align-items: baseline; gap: 8px; white-space: normal;">
                    <span style="color: var(--text-muted); font-size: 0.8em; flex-shrink: 0; min-width: 68px;">${formatDateRu(t.date)}</span>
                    <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${highlightText(t.text, q)}</span>
                </div>`;
            });
        }
        if (events.length > 0) {
            html += `<div class="search-section-title" style="padding: 6px 14px 2px; margin: 0;">🎯 События</div>`;
            events.slice(0, 5).forEach(ev => {
                html += `<div class="autocomplete-item" data-date="${escapeAttr(ev.base_date)}" style="display: flex; align-items: baseline; gap: 8px; white-space: normal;">
                    <span style="color: var(--text-muted); font-size: 0.8em; flex-shrink: 0; min-width: 68px;">${formatDateRu(ev.base_date)}</span>
                    <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${highlightText(ev.lesson, q)}</span>
                </div>`;
            });
        }
        dropdown.innerHTML = html;
    }

    input.addEventListener('input', () => {
        _inlineSearchQuery = input.value.trim();
        if (_inlineSearchDebounce) clearTimeout(_inlineSearchDebounce);
        if (_inlineSearchQuery.length < 2) { hide(); return; }
        _inlineSearchDebounce = setTimeout(() => fetchAndRender(_inlineSearchQuery), 220);
    });

    input.addEventListener('focus', () => {
        const q = input.value.trim();
        if (q.length >= 2) {
            _inlineSearchQuery = q;
            fetchAndRender(q);
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(hide, 180);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { hide(); input.blur(); }
        if (e.key === 'Enter') {
            e.preventDefault();
            const first = dropdown.querySelector('.autocomplete-item[data-date]');
            if (first) onInlineSearchClick(first.dataset.date);
        }
    });

    dropdown.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.autocomplete-item[data-date]');
        if (!item) return;
        e.preventDefault();
        onInlineSearchClick(item.dataset.date);
    });

    window.addEventListener('scroll', () => { if (dropdown.style.display === 'block') position(); }, true);
    window.addEventListener('resize', () => { if (dropdown.style.display === 'block') position(); });
}

function onInlineSearchClick(dateStr) {
    const input = document.getElementById('globalSearchInput');
    if (input) input.value = '';
    if (_inlineSearchDropdown) _inlineSearchDropdown.style.display = 'none';
    if (typeof closeInlineSearch === 'function') closeInlineSearch();
    if (typeof jumpToDate === 'function') jumpToDate(dateStr);
}

// === Разворачивание поля в компактной шапке ===
function openInlineSearch() {
    const normalRow  = document.getElementById('compactHeaderNormal');
    const actionsRow = document.getElementById('compactHeaderActions');
    const searchRow  = document.getElementById('compactSearchRow');
    const input      = document.getElementById('globalSearchInput');
    if (!searchRow || !input) return;

    if (normalRow)  normalRow.classList.add('d-none');
    if (actionsRow) actionsRow.classList.add('d-none');
    searchRow.classList.remove('d-none');
    searchRow.classList.add('d-flex');
    setTimeout(() => input.focus(), 30);
}

function closeInlineSearch() {
    const normalRow  = document.getElementById('compactHeaderNormal');
    const actionsRow = document.getElementById('compactHeaderActions');
    const searchRow  = document.getElementById('compactSearchRow');
    const input      = document.getElementById('globalSearchInput');
    if (!searchRow) return;

    searchRow.classList.add('d-none');
    searchRow.classList.remove('d-flex');
    if (normalRow)  normalRow.classList.remove('d-none');
    if (actionsRow) actionsRow.classList.remove('d-none');

    if (input) input.value = '';
    if (_inlineSearchDropdown) _inlineSearchDropdown.style.display = 'none';
    _inlineSearchQuery = '';
}

// === Модалка поиска (Ctrl+K fallback) ===

function openSearchModal() {
    const modalEl = document.getElementById('searchModal');
    if (!modalEl) {
        console.warn('[search] modal #searchModal не найден в DOM');
        return;
    }
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.show();
}

function closeSearchModal() {
    const modalEl = document.getElementById('searchModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
}

function initSearch() {
    const input = document.getElementById('searchInput');
    const modalEl = document.getElementById('searchModal');

    if (!input) return;
    if (!modalEl) return;

    input.addEventListener('input', () => {
        if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
        _searchDebounceTimer = setTimeout(() => runSearch(input.value), 220);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            jumpToFirstResult();
        }
    });

    modalEl.addEventListener('shown.bs.modal', () => {
        input.focus();
        input.select();
    });
    modalEl.addEventListener('hidden.bs.modal', () => {
        input.value = '';
        _searchResults = { tasks: [], events: [] };
        _searchLastQuery = '';
        _searchMeta.count = 0;
        _searchMeta.query = '';
        renderSearchResults();
    });

    initInlineSearch();
}

async function runSearch(rawQuery) {
    const q = (rawQuery || '').trim();
    _searchLastQuery = q;
    _searchMeta.query = q;

    const container = document.getElementById('searchResults');

    if (q.length < 2) {
        _searchResults = { tasks: [], events: [] };
        _searchMeta.count = 0;
        renderSearchResults();
        return;
    }

    if (container) {
        container.innerHTML = '<div class="text-center text-muted small py-4">⏳ Ищем…</div>';
    }

    try {
        const data = await apiSearch(q);
        if (q !== _searchLastQuery) return;

        _searchResults = {
            tasks:  Array.isArray(data.tasks)  ? data.tasks  : [],
            events: Array.isArray(data.events) ? data.events : []
        };
        _searchMeta.count = (typeof data.count === 'number')
            ? data.count
            : (_searchResults.tasks.length + _searchResults.events.length);
        renderSearchResults();

    } catch (e) {
        console.error('[search] request failed:', e);
        if (container) {
            const status = e && e.status ? ` (HTTP ${e.status})` : '';
            container.innerHTML = `
                <div class="text-center text-danger small py-4">
                    ❌ Ошибка поиска${status}<br>
                    <span class="text-muted">${escapeHtml(e.message || String(e))}</span>
                </div>`;
        }
    }
}

function renderSearchResults() {
    const container = document.getElementById('searchResults');
    if (!container) return;

    const q = _searchLastQuery;

    if (q.length < 2) {
        container.innerHTML = '<div class="text-center text-muted small py-4">Начните вводить запрос (минимум 2 символа)</div>';
        return;
    }

    const tasks  = _searchResults.tasks  || [];
    const events = _searchResults.events || [];

    if (tasks.length === 0 && events.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted small py-4">
                Ничего не найдено по запросу «${escapeHtml(q)}»
            </div>
            <div class="search-meta">Запрос: «${escapeHtml(q)}» · Найдено: 0</div>`;
        return;
    }

    let html = '';

    if (tasks.length > 0) {
        html += `<div class="search-section-title">📝 Заметки · ${tasks.length}</div>`;
        tasks.forEach(t => {
            const label = statusLabel(t.status);
            const color = statusColor(t.status);
            const dateStr = formatDateRu(t.date);
            html += `
                <div class="search-result-card" onclick="onSearchResultClick('${t.date}')">
                    <div class="d-flex justify-content-between align-items-start mb-1">
                        <span class="text-muted small">📅 ${dateStr}</span>
                        <span class="badge" style="background:${color}; font-size:0.65em;">${label}</span>
                    </div>
                    <div class="search-result-text">${highlightText(t.text, q)}</div>
                </div>`;
        });
    }

    if (events.length > 0) {
        html += `<div class="search-section-title mt-3">🎯 События и пары · ${events.length}</div>`;
        events.forEach(ev => {
            const kindLabel = ev.is_event ? 'Событие' : 'Пара';
            const kindColor = ev.is_event ? '#10b981' : '#8b5cf6';
            const dateStr = formatDateRu(ev.base_date);
            const time = ev.time_range ? ` · ${ev.time_range}` : '';

            const extra = [];
            if (ev.type_name) extra.push(escapeHtml(ev.type_name));
            if (ev.location)  extra.push(escapeHtml(ev.location));
            if (ev.teacher)   extra.push(escapeHtml(ev.teacher));
            const extraHtml = extra.length
                ? `<div class="text-muted small mt-1">${extra.join(' · ')}</div>`
                : '';

            html += `
                <div class="search-result-card" onclick="onSearchResultClick('${ev.base_date}')">
                    <div class="d-flex justify-content-between align-items-start mb-1">
                        <span class="text-muted small">📅 ${dateStr}${time}</span>
                        <span class="badge" style="background:${kindColor}; font-size:0.65em;">${kindLabel}</span>
                    </div>
                    <div class="search-result-text">${highlightText(ev.lesson, q)}</div>
                    ${extraHtml}
                </div>`;
        });
    }

    html += `<div class="search-meta">Запрос: «${escapeHtml(q)}» · Найдено: ${_searchMeta.count}</div>`;

    container.innerHTML = html;
}

function onSearchResultClick(dateStr) {
    closeSearchModal();
    if (typeof jumpToDate === 'function') jumpToDate(dateStr);
}

function jumpToFirstResult() {
    if (_searchLastQuery.length < 2) return;
    const t = _searchResults.tasks || [];
    const e = _searchResults.events || [];
    if (t.length > 0) return onSearchResultClick(t[0].date);
    if (e.length > 0) return onSearchResultClick(e[0].base_date);
}

function statusLabel(s) {
    return ({
        green: 'Обычная',
        orange: 'Важная',
        red: 'Срочная',
        completed: 'Выполнено'
    })[s] || s || '';
}

function statusColor(s) {
    return ({
        green: '#10b981',
        orange: '#f59e0b',
        red: '#ef4444',
        completed: '#94a3b8'
    })[s] || '#94a3b8';
}

function highlightText(text, query) {
    const safeText = escapeHtml(text || '');
    if (!query) return safeText;

    const safeQuery = escapeHtml(query);
    const regexSafe = safeQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!regexSafe) return safeText;

    try {
        const regex = new RegExp(`(${regexSafe})`, 'gi');
        return safeText.replace(regex, '<mark>$1</mark>');
    } catch (e) {
        return safeText;
    }
}

;
// --- autocomplete.js ---
// T9-автокомплит для полей ввода групп.
//
// Поведение:
//   • groupsLoaded === false и groupsLoadFailed === false → dropdown
//     показывает «⏳ Загрузка справочника…» + кнопку «Создать».
//   • groupsLoadFailed === true → «⚠️ Справочник недоступен» + кнопку
//     «Создать».
//   • groupsLoaded === true → обычный T9-поиск по allGroups.
//   • События ezh:groups-loaded / ezh:groups-load-failed перерисовывают
//     открытый dropdown (через main.js → ensureGroupsLoaded).
//   • Кнопка «➕ Создать группу «XYZ»» показывается при любом состоянии,
//     если введён непустой текст и точного совпадения нет.

const _AC_DEBOUNCE_MS = 80;

let _allGroupsLowerCache = null;

function _getAllGroupsLower() {
    if (!_allGroupsLowerCache || _allGroupsLowerCache.length !== allGroups.length) {
        _allGroupsLowerCache = allGroups.map(g => g.toLowerCase());
    }
    return _allGroupsLowerCache;
}

function initGroupAutocomplete(input) {
    if (!input) return;

    if (input.dataset.acInit === '1') {
        console.log('[ac] already initialized, skip:', input.id);
        return;
    }
    input.dataset.acInit = '1';

    console.log('[ac] init on', input.id || input.name);

    let dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-list';
    dropdown.dataset.acFor = input.id || '';
    document.body.appendChild(dropdown);

    let currentFocus = -1;
    let renderTimer = null;

    function positionDropdown() {
        let rect = input.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 2) + 'px';
        dropdown.style.width = Math.max(rect.width, 280) + 'px';
    }
    function hide() { dropdown.style.display = 'none'; currentFocus = -1; }
    function getItems() {
        return dropdown.querySelectorAll(
            '.autocomplete-item:not(.autocomplete-empty):not(.autocomplete-footer)'
        );
    }
    function updateActive() {
        let items = getItems();
        items.forEach((it, i) => it.classList.toggle('active', i === currentFocus));
        if (items[currentFocus]) items[currentFocus].scrollIntoView({ block: 'nearest' });
    }

    function _addButtonHtml(query) {
        return `
            <div class="autocomplete-item autocomplete-add" data-add="${escapeAttr(query)}">
                <div class="autocomplete-add-title">➕ Создать группу «${escapeHtml(query)}»</div>
                <div class="autocomplete-add-hint">Не найдена в справочнике — добавьте в свою базу</div>
            </div>`;
    }

    function render() {
        const query = input.value.trim();
        const lower = query.toLowerCase();
        const isLoading = (typeof groupsLoaded !== 'undefined') && !groupsLoaded
            && (typeof groupsLoadFailed === 'undefined' || !groupsLoadFailed);
        const failed = (typeof groupsLoadFailed !== 'undefined') && groupsLoadFailed;

        console.log('[ac] render', {
            input: input.id,
            query: query,
            groupsCount: allGroups.length,
            loaded: (typeof groupsLoaded !== 'undefined') ? groupsLoaded : 'undefined',
            failed: failed,
            isLoading: isLoading
        });

        let html = '';

        // ── 1. Состояние: справочник недоступен ──────────────
        if (failed && allGroups.length === 0) {
            html += '<div class="autocomplete-item autocomplete-empty">⚠️ Справочник недоступен</div>';
            if (query) html += _addButtonHtml(query);
            dropdown.innerHTML = html;
            positionDropdown();
            dropdown.style.display = 'block';
            currentFocus = -1;
            return;
        }

        // ── 2. Состояние: загрузка ──────────────────────────
        if (isLoading && allGroups.length === 0) {
            html += '<div class="autocomplete-item autocomplete-empty">⏳ Загрузка справочника…</div>';
            if (query) html += _addButtonHtml(query);
            dropdown.innerHTML = html;
            positionDropdown();
            dropdown.style.display = 'block';
            currentFocus = -1;
            return;
        }

        // ── 3. Обычный поиск ────────────────────────────────
        let matches = [];
        if (!lower) {
            matches = allGroups.slice(0, 40);
        } else {
            const lowerAll = _getAllGroupsLower();
            let starts = [], contains = [];
            for (let i = 0; i < allGroups.length; i++) {
                const gl = lowerAll[i];
                if (gl.startsWith(lower)) starts.push(allGroups[i]);
                else if (gl.includes(lower)) contains.push(allGroups[i]);
            }
            matches = starts.concat(contains).slice(0, 50);
        }
        const exact = lower && _getAllGroupsLower().indexOf(lower) !== -1;

        if (matches.length === 0 && !query) {
            html += '<div class="autocomplete-item autocomplete-empty">Справочник групп пуст</div>';
        } else if (matches.length === 0) {
            html += '<div class="autocomplete-item autocomplete-empty">В справочнике ничего не найдено</div>';
        } else {
            matches.forEach(g => {
                html += `<div class="autocomplete-item" data-value="${escapeAttr(g)}">${highlightMatch(g, query)}</div>`;
            });
        }

        if (query && !exact) html += _addButtonHtml(query);

        if (allGroups.length > 0) {
            html += `<div class="autocomplete-footer">Всего групп в справочнике: ${allGroups.length}</div>`;
        }

        dropdown.innerHTML = html;
        positionDropdown();
        dropdown.style.display = 'block';
        currentFocus = -1;
    }

    function renderDebounced() {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(render, _AC_DEBOUNCE_MS);
    }

    input.addEventListener('focus', render);
    input.addEventListener('input', renderDebounced);
    input.addEventListener('blur', () => setTimeout(hide, 180));

    input.addEventListener('keydown', (e) => {
        let items = getItems();
        if (dropdown.style.display !== 'block') {
            if (e.key === 'ArrowDown') { render(); e.preventDefault(); }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentFocus = (currentFocus + 1) % Math.max(items.length, 1);
            updateActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentFocus = (currentFocus - 1 + items.length) % Math.max(items.length, 1);
            updateActive();
        } else if (e.key === 'Enter') {
            if (currentFocus > -1 && items[currentFocus]) {
                e.preventDefault();
                e.stopPropagation();
                items[currentFocus].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            } else if (items.length > 0 && input.value.trim()) {
                const exact = _getAllGroupsLower().indexOf(input.value.trim().toLowerCase()) !== -1;
                if (exact) hide();
            }
        } else if (e.key === 'Escape') {
            hide();
        }
    });

    dropdown.addEventListener('mousedown', async (e) => {
        let item = e.target.closest('.autocomplete-item');
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();

        if (item.dataset.value) {
            input.value = item.dataset.value;
            hide();
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }

        if (item.dataset.add) {
            const name = item.dataset.add.trim();
            if (!name) return;
            console.log('[ac] creating custom group:', name);
            try {
                const data = await apiAddCustomGroup(name);
                if (data && data.success) {
                    if (!validGroups.has(name.toUpperCase())) {
                        validGroups.add(name.toUpperCase());
                        allGroups.push(name);
                    }
                    input.value = name;
                    hide();
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof showUpdateNotification === 'function') {
                        showUpdateNotification(`✅ Группа «${name}» добавлена`);
                    }
                } else if (data && data.error) {
                    if (typeof showUpdateNotification === 'function') {
                        showUpdateNotification(`❌ ${data.error}`);
                    }
                }
            } catch (err) {
                console.error('[ac] add custom group failed:', err);
                if (typeof showUpdateNotification === 'function') {
                    showUpdateNotification('❌ Не удалось добавить группу (проверьте формат)');
                }
            }
        }
    });

    // Перерисовка по событиям загрузки справочника.
    document.addEventListener('ezh:groups-loaded', () => {
        if (dropdown.style.display === 'block') render();
    });
    document.addEventListener('ezh:groups-load-failed', () => {
        if (dropdown.style.display === 'block') render();
    });

    window.addEventListener('scroll', () => {
        if (dropdown.style.display === 'block') positionDropdown();
    }, true);
    window.addEventListener('resize', () => {
        if (dropdown.style.display === 'block') positionDropdown();
    });
}

;
// --- notifications.js ---
// Уведомления о парах и событиях.
//
// Android: нативный мост EzhNative (AlarmManager + NotificationReceiver).
// Браузер: Web Notifications.
//
// _notifiedMap персистится в localStorage: иначе после reload в web-режиме
// уведомления по уже отправленным парам приходят повторно.

let _notificationCheckInterval = null;
let _notifiedMap = new Map();

const NOTIFIED_MAP_STORAGE_KEY = 'ezhNotifiedMap';
const NOTIFIED_MAP_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let _lastScheduledSignature = '';

const NOTIFICATION_CHECK_MS = 60 * 1000;
const NOTIFICATION_MAX_LOOKAHEAD_DAYS = 56;
const NATIVE_HORIZON_DAYS = 30;

function _loadNotifiedMap() {
    try {
        const raw = localStorage.getItem(NOTIFIED_MAP_STORAGE_KEY);
        if (!raw) return;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object') return;
        const cutoff = Date.now() - NOTIFIED_MAP_TTL_MS;
        for (const k in obj) {
            const ts = obj[k];
            if (typeof ts === 'number' && ts > cutoff) {
                _notifiedMap.set(k, ts);
            }
        }
    } catch (e) {
        // Битый localStorage — просто стартуем с пустой картой.
    }
}

function _persistNotifiedMap() {
    try {
        const obj = {};
        _notifiedMap.forEach((v, k) => { obj[k] = v; });
        localStorage.setItem(NOTIFIED_MAP_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {}
}

function _markNotified(key, ts) {
    _notifiedMap.set(key, ts);
    _persistNotifiedMap();
}

function _pruneAndPersistNotifiedMap(nowMs) {
    let changed = false;
    for (const [k, ts] of _notifiedMap) {
        if (nowMs - ts > NOTIFIED_MAP_TTL_MS) {
            _notifiedMap.delete(k);
            changed = true;
        }
    }
    if (changed) _persistNotifiedMap();
}

// Загружаем сразу на старте — до первого refreshNotifications.
_loadNotifiedMap();

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

function _notificationSignature() {
    return [
        Array.isArray(cachedSchedule) ? cachedSchedule.length : 0,
        notificationsEnabled ? 1 : 0,
        notificationAdvance,
        notificationUnit,
    ].join('|');
}

function initNotifications() {
    if (_notificationCheckInterval) clearInterval(_notificationCheckInterval);
    _notificationCheckInterval = setInterval(refreshNotifications, NOTIFICATION_CHECK_MS);
    refreshNotifications();

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refreshNotifications();
            if (_notificationSignature() !== _lastScheduledSignature) {
                scheduleAllNotifications();
            }
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
    if (!_hasNativeBridge()) return;

    // Выключение напоминаний (или отзыв разрешения в системе) должно снимать
    // уже поставленные будильники. Раньше здесь стоял `return` ДО
    // cancelAllNotifications(), поэтому AlarmManager продолжал будить
    // пользователя и после того, как он выключил уведомления.
    if (!notificationsEnabled || !_nativeHasPermission()) {
        try { window.EzhNative.cancelAllNotifications(); } catch (e) {}
        _lastScheduledSignature = _notificationSignature();
        return;
    }

    _lastScheduledSignature = _notificationSignature();

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
                const id = `pair-${pair.date}-${pair.n || 0}-${pair.subgroup || 0}-${_slug(pair.lesson)}`;
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
                    const id = `event-${dateStr}-${ev.custom_id || _slug(ev.lesson)}`;
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
//  ВЕБ-ПУТЬ
// ============================================================

function refreshNotifications() {
    if (!notificationsEnabled) return;
    if (_hasNativeBridge()) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const nowMs = Date.now();
    const advanceMs = advanceToMs(notificationAdvance, notificationUnit);
    const lookaheadMs = Math.max(
        advanceMs,
        NOTIFICATION_MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    _pruneAndPersistNotifiedMap(nowMs);

    if (typeof cachedSchedule !== 'undefined' && Array.isArray(cachedSchedule)) {
        cachedSchedule.forEach(pair => {
            const startMs = _itemStartMs(pair.date, pair.time_range);
            if (!startMs) return;
            const notifyMs = startMs - advanceMs;
            if (nowMs < notifyMs) return;
            if (nowMs >= startMs) return;

            const key = `pair|${pair.date}|${pair.n}|${pair.lesson}|${pair.time_range}`;
            if (_notifiedMap.has(key)) return;
            _markNotified(key, nowMs);

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
                _markNotified(key, nowMs);

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

;
// --- refresh.js ---
// Принудительное обновление расписания с сервера СевГУ.

let _refreshInFlight = false;

async function manualRefresh() {
    if (_refreshInFlight) return;

    const group    = (document.getElementById('groupSelect').value || '').trim();
    const subgroup = document.getElementById('subgroupSelect').value;

    if (!group) {
        alert('Сначала выберите группу');
        return;
    }

    // В разметке у обеих кнопок (мобильная + десктопная) нет стабильных id —
    // находим их по onclick и блокируем все сразу. Иконку не крутим —
    // спиннер живёт в лоадере.
    const refreshButtons = Array.from(
        document.querySelectorAll('button[onclick*="manualRefresh"]')
    );

    console.log('[refresh] START group=%s subgroup=%s', group, subgroup);

    _refreshInFlight = true;
    showGlobalLoader(`🔄 Обновляем «${group}» с СевГУ...`);
    refreshButtons.forEach(b => { b.disabled = true; });

    try {
        // --- 1. Форсим sync с сервера ---
        setLoaderText('📡 Запрашиваем расписание (может занять 5–15 сек)...');
        const syncResult = await apiSyncScheduleForce(group, subgroup);
        const fresh = syncResult.items;
        const exhausted = !!syncResult.exhausted;

        if (Array.isArray(fresh) && fresh.length > 0) {
            cachedSchedule = applyTimeFix(fresh);
            // Частичную загрузку не записываем в sync-время (п.11 §11).
            if (!exhausted && typeof saveSyncTime === 'function') saveSyncTime(group, subgroup);
        } else {
            setLoaderText('📦 Загружаем из локального кэша...');
            const fallback = await apiLoadSchedule(group, subgroup);
            cachedSchedule = applyTimeFix(fallback);
        }

        // --- 2. Кастомное расписание + настройки предметов ---
        setLoaderText('📚 Подтягиваем события и настройки предметов...');
        const [cs, subjects] = await Promise.all([
            apiLoadCustomSchedule(group).catch(() => []),
            apiLoadSubjects().catch(() => ({}))
        ]);
        customScheduleItems   = cs;
        cachedSubjectSettings = subjects;

        // --- 3. Лабы + даты заметок ---
        setLoaderText('📊 Пересчитываем статистику...');
        await updateLabsCache();
        await refreshTaskDates();

        // --- 4. Друзья в фоне ---
        if (typeof syncFriendsSchedules === 'function') {
            syncFriendsSchedules(true).catch(e => console.error('[refresh] friends sync failed', e));
        }

        // --- 5. Перерисовка ---
        setLoaderText('🎨 Рисуем календарь...');
        renderCalendar();
        try { renderCharts(); } catch (e) { console.error('[refresh] renderCharts failed', e); }
        updateScheduleStatus();
        refreshNotifications();
        if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications();
        if (typeof renderSyncFreshness === 'function') renderSyncFreshness();

        const count = Array.isArray(cachedSchedule) ? cachedSchedule.length : 0;
        showUpdateNotification(exhausted
            ? `⚠️ Расписание загружено частично (${count} пар) — попробуйте обновить ещё раз`
            : `✅ Расписание обновлено (${count} пар)`);

    } catch (e) {
        console.error('[refresh] ERROR:', e);
        let msg = '❌ Не удалось обновить расписание';

        const statusFromMsg = (() => {
            const m = /HTTP (\d+)/.exec(e && e.message ? e.message : '');
            return m ? parseInt(m[1], 10) : null;
        })();
        const status = (e && e.status) || statusFromMsg;

        if (status === 429) {
            msg = '⏳ Слишком часто. Подождите немного и попробуйте снова';
        } else if (status === 500) {
            msg = '❌ Сервер не справился с запросом (ошибка 500)';
        } else if (status === 502 || status === 503 || status === 504) {
            msg = '🌐 Сервер СевГУ недоступен. Попробуйте позже';
        } else if (status) {
            msg = `❌ Ошибка HTTP ${status}`;
        } else if (e && e.message) {
            msg = `❌ ${e.message}`;
        }
        showUpdateNotification(msg);

    } finally {
        hideGlobalLoader();
        refreshButtons.forEach(b => { b.disabled = false; });
        _refreshInFlight = false;
    }
}

;
// --- hotkeys.js ---
// Горячие клавиши:
//   Ctrl/⌘ + K — открыть глобальный поиск
//   Ctrl/⌘ + N — создать заметку на сегодня
//   Esc        — свернуть развёрнутый день / отменить ввод заметки
//
// Обработчик висит на document в фазе bubbling. Если открыта
// Bootstrap-модалка — Esc отдаём ей (Bootstrap сам её закроет).
// В полях ввода не мешаем печатать.

(function () {

    function _isTypingContext(el) {
        if (!el) return false;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function _isModalOpen() {
        return document.querySelector('.modal.show') !== null;
    }

    function _isSearchModalOpen() {
        return document.querySelector('#searchModal.show') !== null;
    }

    document.addEventListener('keydown', (e) => {

        const key = (e.key || '').toLowerCase();

        // ─── Ctrl/⌘ + K: глобальный поиск ─────────────────────
        if (key === 'k' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
            // Если поиск уже открыт — просто фокусируем поле и выделяем
            if (_isSearchModalOpen()) {
                e.preventDefault();
                const inp = document.getElementById('searchInput');
                if (inp) { inp.focus(); inp.select(); }
                return;
            }
            // В обычных полях ввода не мешаем пользователю печатать
            if (_isTypingContext(e.target)) return;

            e.preventDefault();
            if (typeof openSearchModal === 'function') openSearchModal();
            return;
        }

        // ─── Ctrl/⌘ + N: заметка на сегодня ────────────────────
        if (key === 'n' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
            if (_isTypingContext(e.target)) return;
            e.preventDefault();
            _openTodayTaskInput();
            return;
        }

        // ─── Esc: свернуть день / отменить ввод заметки ────────
        if (key === 'escape') {

            // 1) Отмена ввода заметки: Esc внутри textarea заметки
            const t = e.target;
            if (t && t.id && t.id.indexOf('task-input-') === 0) {
                e.preventDefault();
                t.value = '';
                const wrap = document.getElementById(
                    'task-input-wrap-' + t.id.slice('task-input-'.length)
                );
                if (wrap) wrap.style.display = 'none';
                t.blur();
                return;
            }

            // 2) Bootstrap-модалки: не мешаем, они сами закроются по Esc
            if (_isModalOpen()) return;

            // 3) Развёрнутый день: сворачиваем
            if (typeof expandedDayDateStr !== 'undefined' && expandedDayDateStr) {
                e.preventDefault();
                if (typeof toggleExpandDay === 'function') {
                    toggleExpandDay(expandedDayDateStr);
                }
            }
        }
    });

    function _openTodayTaskInput() {
        const today = getLocalDateStr(new Date());
        const wrapId = 'task-input-wrap-' + today;

        // Если сегодняшний день не в текущей видимой неделе — прыгаем
        if (!document.getElementById(wrapId)) {
            if (typeof goToToday === 'function') {
                goToToday();
            } else if (typeof jumpToDate === 'function') {
                jumpToDate(today);
            }
        }

        // renderCalendar выполняется синхронно до первого await,
        // так что к следующему кадру DOM уже готов.
        requestAnimationFrame(() => {
            const wrap = document.getElementById(wrapId);
            if (!wrap) return;

            const input = document.getElementById('task-input-' + today);
            if (wrap.style.display === 'none' || wrap.style.display === '') {
                if (typeof toggleTaskInput === 'function') toggleTaskInput(today);
            }
            if (input) {
                input.focus();
                const len = input.value.length;
                try { input.setSelectionRange(len, len); } catch (err) {}
            }
        });
    }

})();

;
// --- mobile.js ---
(function () {
    "use strict";
    var BREAKPOINT = 992;
    var STORAGE_KEY = "ezhMobileTab";

    function isMobile() { return window.innerWidth < BREAKPOINT; }

    function updateNavActive(tab) {
        var items = document.querySelectorAll(".mobile-nav-item");
        for (var i = 0; i < items.length; i++) {
            if (items[i].getAttribute("data-tab") === tab) items[i].classList.add("active");
            else items[i].classList.remove("active");
        }
    }

    function switchTab(tab) {
        if (tab !== "schedule" && tab !== "day" && tab !== "people" && tab !== "widgets") tab = "schedule";
        document.body.setAttribute("data-mobile-tab", tab);
        try { localStorage.setItem(STORAGE_KEY, tab); } catch (e) {}
        updateNavActive(tab);

        // Уходя из «Дня», снимаем дневной режим: иначе стрелки
        // «Расписания» продолжают листать по одному дню.
        if (tab !== 'day' && window.expandedDayDateStr) {
            window.expandedDayDateStr = null;
            window._verticalDayOffset = 0;
            var fullCols = document.querySelectorAll('.day-col.fullscreen-day');
            for (var f = 0; f < fullCols.length; f++) fullCols[f].classList.remove('fullscreen-day');
            var calEl = document.getElementById('calendar');
            if (calEl) calEl.classList.remove('has-fullscreen');
            if (typeof renderCalendar === 'function' && document.getElementById('calendar')) renderCalendar();
        }

        if (tab === 'day') {
            if (!window.expandedDayDateStr) {
                const today = new Date();
                const monday = new Date(today);
                monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1));
                const isCurrentWeek = new Date(currentBaseDate).toDateString() === monday.toDateString();
                window.expandedDayDateStr = isCurrentWeek ? getLocalDateStr(today) : getLocalDateStr(currentBaseDate);
            }
            if (typeof renderDayView === 'function') renderDayView();
        }

        if (isMobile()) window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.switchMobileTab = switchTab;

    window.openDayMode = function(dateStr) {
        if (isMobile()) {
            window.expandedDayDateStr = dateStr;
            switchTab('day');
        } else {
            // toggleExpandDay сам решает, разворачивать или сворачивать —
            // проверяет наличие .fullscreen-day у колонки. Старая проверка
            // «expandedDayDateStr !== dateStr» ломала сворачивание повторным
            // кликом по развёрнутому дню.
            if (typeof toggleExpandDay === 'function') {
                toggleExpandDay(dateStr);
            }
        }
    };

    window.checkOnboarding = function() {
        if (!isMobile()) return;
        var savedGroup = localStorage.getItem('savedGroup');
        var bigHeader = document.getElementById('onboardingHeader');
        var compactHeader = document.getElementById('compactHeader');
        var compactGroup = document.getElementById('compactGroupName');

        if (bigHeader) bigHeader.classList.add('d-none');
        if (compactHeader) compactHeader.classList.remove('d-none');

        if (compactGroup) {
            if (savedGroup) {
                compactGroup.textContent = savedGroup;
                compactGroup.classList.remove('text-danger');
            } else {
                compactGroup.textContent = 'Выбрать группу';
                compactGroup.classList.add('text-danger');
            }
        }
    };

    window.showGroupChange = function() {
        if (typeof openGroupSelectModal === 'function') {
            openGroupSelectModal(false);
        }
    };

    window.ezhOnBackPressed = function() {
        const modals = document.querySelectorAll('.modal.show');
        if (modals.length > 0) {
            modals.forEach(m => {
                const inst = bootstrap.Modal.getInstance(m);
                if (inst) inst.hide();
            });
            return true;
        }
        const currentTab = document.body.getAttribute('data-mobile-tab');
        if (currentTab && currentTab !== 'schedule') {
            switchTab('schedule');
            return true;
        }
        return false;
    };

    function init() {
        if (!isMobile()) return;
        var saved = "schedule";
        try { saved = localStorage.getItem(STORAGE_KEY) || "schedule"; } catch (e) {}
        updateNavActive(saved);
        document.body.setAttribute("data-mobile-tab", saved);
        if (saved === 'day' && typeof renderDayView === 'function') renderDayView();
        if (typeof checkOnboarding === 'function') checkOnboarding();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();

;
// --- group-select.js ---
// Динамическая модалка выбора группы.

let _groupSelectModalInstance = null;
let _gsFocusBound = false;

function _gsBindFocusOnShow(modalEl) {
    if (_gsFocusBound) return;
    _gsFocusBound = true;
    modalEl.addEventListener('shown.bs.modal', () => {
        const inp = document.getElementById('gsGroupInput');
        if (inp) setTimeout(() => { inp.focus(); }, 60);
    });
}

function openGroupSelectModal(forced = false) {
    try {
        console.log('[group-select] open, forced =', forced);
        if (typeof bootstrap === 'undefined') {
            alert('❌ Критическая ошибка: Bootstrap не загружен!');
            return;
        }

        let modalEl = document.getElementById('groupSelectModal');

        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.className = 'modal fade';
            modalEl.id = 'groupSelectModal';
            modalEl.tabIndex = -1;
            modalEl.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow">
                        <div class="modal-header py-3 border-bottom-0">
                            <h5 class="modal-title fw-bold mb-0" id="gsModalTitle">Выберите группу</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label small fw-bold">Группа</label>
                                <input type="text" id="gsGroupInput" class="form-control" placeholder="Например, ИВТ/б-24-1-о" autocomplete="off">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">Подгруппа</label>
                                <select id="gsSubgroupSelect" class="form-select">
                                    <option value="0">Все подгруппы</option>
                                    <option value="1">1 подгруппа</option>
                                    <option value="2">2 подгруппа</option>
                                </select>
                            </div>
                            <div id="gsHint" class="small text-danger mb-2" style="display:none;"></div>
                        </div>
                        <div class="modal-footer border-0">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" id="gsCancelBtn">Отмена</button>
                            <button type="button" class="btn btn-primary fw-bold" id="gsSubmitBtn">Продолжить</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
            document.getElementById('gsSubmitBtn').onclick = saveGroupFromModal;
        }

        // Всегда инициализируем — внутри защита input.dataset.acInit.
        const gsInput = document.getElementById('gsGroupInput');
        if (gsInput && typeof initGroupAutocomplete === 'function') {
            initGroupAutocomplete(gsInput);
        } else if (gsInput) {
            console.warn('[group-select] initGroupAutocomplete not available');
        }

        _gsBindFocusOnShow(modalEl);

        const title = document.getElementById('gsModalTitle');
        const cancelBtn = document.getElementById('gsCancelBtn');

        if (title) title.textContent = forced ? 'Выберите группу' : 'Сменить группу';
        if (cancelBtn) cancelBtn.style.display = forced ? 'none' : '';

        const savedGroup = localStorage.getItem('savedGroup') || '';
        const savedSub = localStorage.getItem('savedSubgroup') || '0';
        if (gsInput) gsInput.value = savedGroup;
        const subSel = document.getElementById('gsSubgroupSelect');
        if (subSel) subSel.value = savedSub;

        _groupSelectModalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        _groupSelectModalInstance.show();

    } catch (e) {
        console.error('[group-select] open failed:', e);
        alert('❌ Ошибка при открытии модалки:\n' + (e && e.message ? e.message : e));
    }
}

async function saveGroupFromModal() {
    const input = document.getElementById('gsGroupInput');
    const select = document.getElementById('gsSubgroupSelect');
    const hint = document.getElementById('gsHint');
    if (!input || !select) return;

    const group = (input.value || '').trim();
    const subgroup = select.value || '0';

    if (!group) {
        if (hint) { hint.textContent = 'Введите название группы'; hint.style.display = 'block'; }
        input.focus();
        return;
    }

    if (typeof validGroups !== 'undefined' && validGroups.size > 0
            && !validGroups.has(group.toUpperCase())) {
        const ok = confirm(
            `Группы «${group}» нет в справочнике.\n\nПродолжить? Она будет добавлена в вашу базу.`
        );
        if (!ok) { input.focus(); return; }
        try {
            await apiAddCustomGroup(group);
            validGroups.add(group.toUpperCase());
            if (!allGroups.includes(group)) allGroups.push(group);
        } catch (e) {
            console.error('[group-select] add custom failed:', e);
            if (hint) {
                hint.textContent = 'Не удалось добавить группу. Проверьте формат (буквы, цифры, / . _ -).';
                hint.style.display = 'block';
            }
            return;
        }
    }

    document.getElementById('groupSelect').value = group;
    document.getElementById('subgroupSelect').value = subgroup;

    if (_groupSelectModalInstance) _groupSelectModalInstance.hide();

    updateGroupDisplay();

    if (typeof fetchSemesterData === 'function') {
        await fetchSemesterData();
    }

    if (typeof checkOnboarding === 'function') checkOnboarding();
}

function updateGroupDisplay() {
    const gsInput = document.getElementById('groupSelect');
    const ssInput = document.getElementById('subgroupSelect');
    const group = gsInput ? gsInput.value.trim() : '';
    const subgroup = ssInput ? ssInput.value : '0';

    const display = document.getElementById('groupDisplay');
    if (display) {
        if (group) {
            let label = group;
            if (subgroup !== '0') label += ` (${subgroup} подгр.)`;
            display.textContent = label;
            display.classList.remove('group-display-empty');
        } else {
            display.textContent = 'Группа не выбрана';
            display.classList.add('group-display-empty');
        }
    }

    const compactName = document.getElementById('compactGroupName');
    if (compactName) {
        compactName.textContent = group || 'Выбрать группу';
    }
}

;
// --- moodle-pro.js ---
// ============================================================
//  Еж Про (Moodle) — клиентская часть
// ------------------------------------------------------------
//  Загружается после state.js / settings.js / widgets.js и
//  ПЕРЕОПРЕДЕЛЯЕТ заглушки из state.js, а также патчит
//  applyWidgetVisibility / refreshChartsTheme / openSettingsModal.
//
//  API: /api/moodle/status, /login, /logout, /cancel, /stats
// ============================================================

let moodleStats = [];
let moodleStatsTimestamp = 0;
let moodleStatsWarnings = [];
let moodleSemesterConfig = JSON.parse(localStorage.getItem('moodleSemesterConfig') || '{}');
let proSubjectChart = null;
let isMoodleRefreshing = false;
let moodleAbortController = null;

window.hasLoadedMoodleStats = false;
window.isProActive = false;

// ============================================================
//  ПАТЧИ
// ============================================================

(function patchApplyWidgetVisibility() {
    const orig = window.applyWidgetVisibility;
    window.applyWidgetVisibility = function () {
        if (typeof orig === 'function') orig();

        const wlp = document.getElementById('widgetLabsProCard');
        const wma = document.getElementById('widgetMoodleAvgGradeCard');
        const wms = document.getElementById('widgetMoodleSubjectGradesCard');
        const proReady = window.isProActive && window.hasLoadedMoodleStats;

        if (wlp) wlp.style.display = (proReady && showWidgetLabsPro) ? '' : 'none';
        if (wma) wma.style.display = (proReady && showWidgetMoodleAvg) ? '' : 'none';
        if (wms) wms.style.display = (proReady && showWidgetMoodleSubj) ? '' : 'none';

        const proLockMsg = document.getElementById('proWidgetsLockedMsg');
        const proGrid = document.getElementById('proWidgetsGrid');
        if (proLockMsg && proGrid) {
            if (window.isProActive) {
                proLockMsg.style.display = 'none';
                proGrid.style.display = '';
                proGrid.querySelectorAll('.pro-widget-toggle').forEach(el => el.style.display = '');
            } else {
                proLockMsg.style.display = 'flex';
                proGrid.style.display = 'none';
                proGrid.querySelectorAll('.pro-widget-toggle').forEach(el => el.style.display = 'none');
            }
        }
    };
})();

(function patchRefreshChartsTheme() {
    const orig = window.refreshChartsTheme;
    window.refreshChartsTheme = function () {
        if (typeof orig === 'function') orig();
        if (typeof refreshProChartsTheme === 'function') refreshProChartsTheme();
    };
})();

(function patchOpenSettingsModal() {
    const orig = window.openSettingsModal;
    window.openSettingsModal = function () {
        if (typeof orig === 'function') orig();
        const l1 = document.getElementById('settingsToggleWidgetLabsPro');
        const l2 = document.getElementById('settingsToggleWidgetMoodleAvg');
        const l3 = document.getElementById('settingsToggleWidgetMoodleSubj');
        if (l1) l1.checked = showWidgetLabsPro;
        if (l2) l2.checked = showWidgetMoodleAvg;
        if (l3) l3.checked = showWidgetMoodleSubj;
    };
})();

// Обработчики чекбоксов Pro-виджетов
(function wireProToggles() {
    function bind() {
        const map = {
            settingsToggleWidgetLabsPro: 'showWidgetLabsPro',
            settingsToggleWidgetMoodleAvg: 'showWidgetMoodleAvg',
            settingsToggleWidgetMoodleSubj: 'showWidgetMoodleSubj',
        };
        Object.keys(map).forEach(id => {
            const el = document.getElementById(id);
            if (!el || el.dataset.proBound === '1') return;
            el.dataset.proBound = '1';
            el.addEventListener('change', () => {
                const flagName = map[id];
                const val = el.checked;
                if (flagName === 'showWidgetLabsPro') showWidgetLabsPro = val;
                else if (flagName === 'showWidgetMoodleAvg') showWidgetMoodleAvg = val;
                else if (flagName === 'showWidgetMoodleSubj') showWidgetMoodleSubj = val;
                localStorage.setItem(flagName, val ? 'true' : 'false');
                applyWidgetVisibility();
            });
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const status = await apiGet('/api/moodle/status');
        setProMode(status.logged_in);
        if (status.logged_in) {
            await loadMoodleStats(false);
            if (!sessionStorage.getItem('moodle_bg_refreshed')) {
                sessionStorage.setItem('moodle_bg_refreshed', '1');
                setTimeout(() => {
                    console.log('[moodle] background refresh after 10s');
                    loadMoodleStats(true, true);
                }, 10000);
            }
        }
    } catch (e) {
        console.warn('[moodle] status check failed', e);
    }
});

// ============================================================
//  МОДАЛКА
// ============================================================

async function openMoodleModal() {
    const modalEl = document.getElementById('moodleModal');
    if (!modalEl) return;
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.show();

    const status = await apiGet('/api/moodle/status');
    if (status.logged_in) {
        showMoodleStatsView();
        loadMoodleStats(false);
    } else {
        showMoodleLoginView();
    }
}

function showMoodleLoginView() {
    const f = document.getElementById('moodleLoginForm');
    const s = document.getElementById('moodleStatsArea');
    if (f) f.style.display = 'block';
    if (s) s.style.display = 'none';
}

function showMoodleStatsView() {
    const f = document.getElementById('moodleLoginForm');
    const s = document.getElementById('moodleStatsArea');
    if (f) f.style.display = 'none';
    if (s) s.style.display = 'block';
}

function setProMode(isActive) {
    window.isProActive = isActive;

    [document.getElementById('app-mode-badge'),
     document.getElementById('app-mode-badge-desktop')].forEach(badge => {
        if (!badge) return;
        if (isActive) {
            badge.className = badge.className
                .replace(/\bbasic-mode\b/g, '')
                .replace(/\bpro-mode\b/g, '')
                .trim() + ' pro-mode';
            badge.textContent = 'Pro';
            badge.title = 'Режим Pro активен (нажмите для настроек)';
        } else {
            badge.className = badge.className
                .replace(/\bbasic-mode\b/g, '')
                .replace(/\bpro-mode\b/g, '')
                .trim() + ' basic-mode';
            badge.textContent = 'Basic';
            badge.title = 'Базовая версия (нажмите для входа)';
        }
    });

    if (!isActive) {
        window.hasLoadedMoodleStats = false;
        if (typeof globalLabChartPro !== 'undefined' && globalLabChartPro) {
            try { globalLabChartPro.destroy(); } catch (e) {}
            globalLabChartPro = null;
        }
        if (proSubjectChart) {
            try { proSubjectChart.destroy(); } catch (e) {}
            proSubjectChart = null;
        }
    }

    if (typeof applyWidgetVisibility === 'function') applyWidgetVisibility();
    if (typeof renderCharts === 'function') renderCharts();
}

// ============================================================
//  ВХОД / ВЫХОД
// ============================================================

async function doMoodleLogin() {
    const user = document.getElementById('moodleUser').value.trim();
    const pass = document.getElementById('moodlePass').value.trim();
    if (!user || !pass) return alert('Введите логин и пароль');

    const btn = document.getElementById('moodleLoginBtn');
    const err = document.getElementById('moodleLoginError');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Вход...';
    err.style.display = 'none';

    try {
        const resp = await apiPost('/api/moodle/login', { username: user, password: pass });
        if (resp.success) {
            showMoodleStatsView();
            setProMode(true);
            loadMoodleStats(true);
            if (typeof showUpdateNotification === 'function') showUpdateNotification('🎉 Режим Pro активирован!');
        }
    } catch (e) {
        err.textContent = 'Неверный логин или пароль, либо ошибка сети.';
        err.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Войти';
    }
}

async function doMoodleLogout(forced = false) {
    if (!forced && !confirm('Выйти из аккаунта Moodle?')) return;
    await apiPost('/api/moodle/logout', {});
    moodleStatsWarnings = [];
    showMoodleLoginView();
    setProMode(false);
    sessionStorage.removeItem('moodle_bg_refreshed');

    if (forced) {
        const err = document.getElementById('moodleLoginError');
        if (err) {
            err.textContent = 'Сессия истекла, войдите заново.';
            err.style.display = 'block';
        }
    }
}

function formatAge(ts) {
    if (!ts) return 'нет данных';
    const diff = Math.floor((Date.now() / 1000) - ts);
    if (diff < 60) return 'только что';
    const min = Math.floor(diff / 60);
    if (min < 60) return `${min} мин. назад`;
    const h = Math.floor(min / 60);
    return `${h} ч. назад`;
}

function cancelMoodleRefresh() {
    if (moodleAbortController) moodleAbortController.abort();
    fetch(_api('/api/moodle/cancel'), { method: 'POST' }).catch(e => console.error(e));
}

// ============================================================
//  ЗАГРУЗКА СТАТИСТИКИ
// ============================================================

async function loadMoodleStats(force = false, isBackground = false) {
    if (isMoodleRefreshing && force) {
        cancelMoodleRefresh();
        return;
    }

    if (force) {
        isMoodleRefreshing = true;
        moodleAbortController = new AbortController();
    }

    const container = document.getElementById('moodleStatsContent');
    const updateBtn = document.getElementById('moodleUpdateBtn');

    if (updateBtn) {
        if (isMoodleRefreshing && !isBackground) {
            updateBtn.className = 'btn btn-sm btn-danger fw-bold';
            updateBtn.innerHTML = '⏹ Остановить';
            updateBtn.disabled = false;
        } else {
            updateBtn.className = 'btn btn-sm btn-outline-secondary';
            updateBtn.innerHTML = '🔄 Обновить';
            updateBtn.disabled = isBackground;
        }
    }

    if (!isBackground && container && document.getElementById('moodleStatsArea').style.display === 'block') {
        container.innerHTML = `
            <div class="text-center py-4">
                <div style="font-size:64px;line-height:1;">🦔</div>
                <div class="mt-2 text-muted small">Собираем данные из Moodle (может занять до 5 минут)...</div>
            </div>`;
    }

    try {
        const url = `/api/moodle/stats?force=${force ? '1' : '0'}`;
        const fetchOpts = {};
        if (moodleAbortController) fetchOpts.signal = moodleAbortController.signal;

        const rawResp = await fetch(_api(url), fetchOpts);

        if (rawResp.status === 401) {
            doMoodleLogout(true);
            return;
        }

        const resp = await rawResp.json();

        if (resp.error) {
            if (resp.error === 'Cancelled') {
                if (typeof showUpdateNotification === 'function') showUpdateNotification('⏹ Обновление остановлено');
                isMoodleRefreshing = false;
                loadMoodleStats(false);
                return;
            }
            throw new Error(resp.error);
        }

        moodleStats = resp.data || [];
        moodleStatsTimestamp = resp.timestamp || 0;
        moodleStatsWarnings = Array.isArray(resp.warnings) ? resp.warnings : [];

        window.hasLoadedMoodleStats = true;
        if (typeof applyWidgetVisibility === 'function') applyWidgetVisibility();

        renderMoodleStats();
        renderProWidgets();

        const ageSpan = document.getElementById('moodleDataAge');
        if (ageSpan) ageSpan.textContent = formatAge(moodleStatsTimestamp);

    } catch (e) {
        if (e.name === 'AbortError') {
            if (typeof showUpdateNotification === 'function') showUpdateNotification('⏹ Обновление остановлено');
            isMoodleRefreshing = false;
            loadMoodleStats(false);
        } else {
            if (container && !isBackground && document.getElementById('moodleStatsArea').style.display === 'block') {
                container.innerHTML = `<div class="alert alert-danger">Ошибка: ${escapeHtml(e.message || 'сессия устарела')}. <button class="btn btn-sm btn-outline-danger ms-2" onclick="openMoodleModal()">Перезайти</button></div>`;
            }
        }
    } finally {
        if (force) {
            isMoodleRefreshing = false;
            moodleAbortController = null;
            if (updateBtn) {
                updateBtn.disabled = false;
                updateBtn.className = 'btn btn-sm btn-outline-secondary';
                updateBtn.innerHTML = '🔄 Обновить';
            }
        }
    }
}

function isCourseInCurrentSchedule(courseName, courseId) {
    if (moodleSemesterConfig[courseId]) {
        return moodleSemesterConfig[courseId] === 'current';
    }
    if (!cachedSchedule || cachedSchedule.length === 0) return true;

    let cleanCourse = courseName.replace(/\([^)]*\)/g, '').trim().toLowerCase();
    return cachedSchedule.some(item => {
        let lessonName = item.lesson.toLowerCase();
        return cleanCourse.includes(lessonName) || lessonName.includes(cleanCourse);
    });
}

function _moodleWarningsHtml() {
    if (!moodleStatsWarnings.length) return '';
    return '<div class="alert alert-warning py-2 small mb-3">⚠️ Данные загружены не полностью:'
        + moodleStatsWarnings.map(w => `<div>• ${escapeHtml(w)}</div>`).join('')
        + '</div>';
}

function renderMoodleStats() {
    const container = document.getElementById('moodleStatsContent');
    if (!moodleStats || moodleStats.length === 0) {
        if (container) container.innerHTML = _moodleWarningsHtml()
            + '<div class="text-muted text-center py-3">Нет данных о курсах.</div>';
        return;
    }

    let currentCourses = moodleStats.filter(c => isCourseInCurrentSchedule(c.name, c.id));

    let html = _moodleWarningsHtml() + `
        <div class="d-flex justify-content-between align-items-center mb-3 p-2 bg-light rounded shadow-sm flex-wrap gap-2">
            <div class="small fw-bold text-muted">Показаны предметы текущего семестра (${currentCourses.length})</div>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-warning fw-bold" onclick="syncMoodleDeadlinesToCalendar()">📅 Дедлайны в календарь</button>
                <button class="btn btn-sm btn-success fw-bold" onclick="syncMoodleToWidgets()">📥 Синхронизировать с виджетами</button>
            </div>
        </div>
        <div class="moodle-courses-list">
    `;

    currentCourses.forEach(course => {
        if (!course.assignments || course.assignments.length === 0) return;

        let doneCount = course.assignments.filter(a => a.status === 'Сдано' || a.status === 'На проверке').length;
        let total = course.assignments.length;

        html += `
            <div class="card mb-3 border-0 shadow-sm">
                <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center">
                    <span class="fw-bold small text-truncate" style="max-width: 80%;" title="${escapeHtml(course.name)}">📚 ${escapeHtml(course.name)}</span>
                    <span class="badge ${doneCount === total ? 'bg-success' : 'bg-primary'}">${doneCount} / ${total}</span>
                </div>
                <ul class="list-group list-group-flush small">
        `;

        course.assignments.forEach(act => {
            let badgeClass = 'bg-secondary';
            if (act.status === 'Сдано') badgeClass = 'bg-success';
            else if (act.status === 'На проверке') badgeClass = 'bg-warning text-dark';
            else if (act.status === 'Не сдано') badgeClass = 'bg-danger';
            else if (act.status === 'Тест') badgeClass = 'bg-info text-dark';

            let dueHtml = act.due ? `<span class="text-muted ms-2" style="font-size:0.85em;">📅 ${escapeHtml(act.due)}</span>` : '';

            html += `
                <li class="list-group-item py-2 d-flex justify-content-between align-items-center">
                    <div class="text-truncate pe-2" style="max-width: 60%;" title="${escapeHtml(act.name)}">
                        ${escapeHtml(act.name)} ${dueHtml}
                    </div>
                    <div class="text-end">
                        <span class="badge ${badgeClass}">${escapeHtml(act.status)}</span>
                        ${act.grade !== '—' ? `<span class="ms-1 badge bg-success">${escapeHtml(act.grade)}</span>` : ''}
                    </div>
                </li>
            `;
        });

        html += `</ul></div>`;
    });
    html += '</div>';
    if (container) container.innerHTML = html;
}

// ============================================================
//  ДЕДЛАЙНЫ В КАЛЕНДАРЬ + СИНХРОНИЗАЦИЯ
// ============================================================

function extractLabNum(name) {
    const match = name.match(/(?:ЛР|ЛЗ|ПЗ|Лабораторная работа|Практическое задание|Практическая работа|Лабораторное занятие|Лабораторная)\s*№?\s*(\d+(?:\.\d+)?)/i);
    return match ? match[1] : null;
}

async function syncMoodleDeadlinesToCalendar() {
    if (!moodleStats || moodleStats.length === 0) {
        alert('Нет данных Moodle. Обновите статистику.');
        return;
    }
    if (!confirm('Добавить дедлайны из Moodle в календарь (за 2 дня до сдачи)?')) return;

    let added = 0;
    let todayStr = getLocalDateStr(new Date());

    for (const course of moodleStats) {
        if (!isCourseInCurrentSchedule(course.name, course.id)) continue;

        let cleanCourse = course.name.replace(/\([^)]*\)/g, '').trim();

        for (const act of course.assignments) {
            if (act.status === 'Сдано' || act.status === 'На проверке' || act.status === 'Черновик') continue;
            if (!act.due_iso) continue;

            let [y, m, d] = act.due_iso.split('-').map(Number);
            let dueDate = new Date(y, m - 1, d);
            dueDate.setDate(dueDate.getDate() - 2);
            let taskDateStr = getLocalDateStr(dueDate);

            if (taskDateStr < todayStr) continue;

            let text = `Сдать: ${cleanCourse} — ${act.name}`;

            try {
                await apiCreateTask({ date: taskDateStr, text: text, status: 'red' });
                added++;
            } catch (e) {
                console.error('createTask failed', e);
            }
        }
    }

    if (added > 0) {
        if (typeof refreshTaskDates === 'function') await refreshTaskDates();
        if (typeof renderCalendar === 'function') renderCalendar();
        alert(`Добавлено напоминаний о дедлайнах: ${added}`);
    } else {
        alert('Нет актуальных дедлайнов для добавления (все сдано или даты прошли).');
    }
}

async function syncMoodleToWidgets() {
    if (!cachedSchedule || cachedSchedule.length === 0) {
        alert("Сначала загрузите расписание, чтобы мы знали, к каким предметам привязывать лабы.");
        return;
    }

    if (!confirm("Синхронизировать сданные работы из Moodle с вашими виджетами «Лабораторные»?\n\nДубликаты (например, ЛР №1 и ЛР №1. архив) будут объединены.")) return;

    let updatedCount = 0;
    let payload = [];

    for (const course of moodleStats) {
        if (!isCourseInCurrentSchedule(course.name, course.id)) continue;

        let uniqueLabs = {};
        course.assignments.forEach(a => {
            if (a.type !== 'assign') return;
            let num = extractLabNum(a.name);
            if (!num) return;
            if (!uniqueLabs[num]) uniqueLabs[num] = a;
            else {
                if (a.status === 'Сдано' && uniqueLabs[num].status !== 'Сдано') uniqueLabs[num] = a;
                else if (a.status === 'На проверке' && uniqueLabs[num].status === 'Ожидает') uniqueLabs[num] = a;
            }
        });

        let totalLabs = Object.keys(uniqueLabs).length;
        let doneLabs = Object.values(uniqueLabs).filter(a => a.status === 'Сдано' || a.status === 'На проверке').length;
        if (totalLabs === 0) continue;

        let cleanCourse = course.name.replace(/\([^)]*\)/g, '').trim().toLowerCase();
        let matchingSubjects = new Set();

        cachedSchedule.forEach(item => {
            if (item.type_name !== 'ЛЗ' && item.type_name !== 'ПЗ') return;
            let lessonName = item.lesson.toLowerCase();
            if (cleanCourse.includes(lessonName) || lessonName.includes(cleanCourse)) {
                matchingSubjects.add(`${item.lesson} (${item.type_name})`);
            }
        });

        for (const subj of matchingSubjects) {
            payload.push({
                group: document.getElementById('groupSelect').value.trim(),
                subject: subj,
                completed: doneLabs,
                total: totalLabs
            });
            updatedCount++;
        }
    }

    if (payload.length === 0) {
        alert("Не удалось найти совпадений.");
        return;
    }

    try {
        await apiSaveLabs(payload);

        const group = document.getElementById('groupSelect').value.trim();
        let currentLabItems = await apiLoadLabItems(group);

        let itemsToUpdate = [];
        for (const course of moodleStats) {
            if (!isCourseInCurrentSchedule(course.name, course.id)) continue;
            let cleanCourse = course.name.replace(/\([^)]*\)/g, '').trim().toLowerCase();

            cachedSchedule.forEach(item => {
                if (item.type_name !== 'ЛЗ' && item.type_name !== 'ПЗ') return;
                let lessonName = item.lesson.toLowerCase();
                if (!cleanCourse.includes(lessonName) && !lessonName.includes(cleanCourse)) return;

                let subjKey = `${item.lesson} (${item.type_name})`;
                let labList = currentLabItems[subjKey] || [];

                course.assignments.forEach(a => {
                    if (a.type !== 'assign') return;
                    let num = extractLabNum(a.name);
                    if (!num) return;
                    let isDone = (a.status === 'Сдано' || a.status === 'На проверке' || a.status === 'Черновик');
                    if (!isDone) return;

                    let matchingItem = labList.find(l => extractLabNum(l.title) === num);
                    if (matchingItem && !matchingItem.completed) {
                        itemsToUpdate.push({ id: matchingItem.id, completed: 1 });
                    }
                });
            });
        }

        for (const item of itemsToUpdate) {
            try { await apiUpdateLabItem(item.id, { completed: item.completed }); } catch (e) {}
        }

        await updateLabsCache();
        renderCharts();
        alert(`Синхронизировано предметов: ${updatedCount}. Отмечено сданных лаб: ${itemsToUpdate.length}.`);
    } catch (e) {
        console.error(e);
        alert("Ошибка при сохранении данных.");
    }
}

// ============================================================
//  PRO-ВИДЖЕТЫ
// ============================================================

function renderProWidgets() {
    if (!moodleStats || moodleStats.length === 0) return;

    let currentCourses = moodleStats.filter(c => isCourseInCurrentSchedule(c.name, c.id));

    let totalGradeSum = 0;
    let totalGradeCount = 0;
    let subjectGrades = {};

    currentCourses.forEach(course => {
        let shortName = course.name.split('(')[0].trim();
        if (!subjectGrades[shortName]) subjectGrades[shortName] = [];

        course.assignments.forEach(act => {
            if (act.grade_num !== null && act.grade_num > 0) {
                totalGradeSum += act.grade_num;
                totalGradeCount++;
                subjectGrades[shortName].push(act);
            }
        });
    });

    const avgText = document.getElementById('proAvgGradeText');
    if (avgText) {
        avgText.textContent = totalGradeCount > 0 ? (totalGradeSum / totalGradeCount).toFixed(1) : '—';
    }

    if (window.isProActive) {
        let done = 0, attached = 0, remaining = 0;
        currentCourses.forEach(c => {
            c.assignments.forEach(a => {
                if (a.type !== 'assign') return;
                if (a.status === 'Сдано') done++;
                else if (a.status === 'На проверке' || a.status === 'Черновик') attached++;
                else remaining++;
            });
        });

        const cDone = getThemeColor('--chart-lab-done', '#14b8a6');
        const cAttached = getThemeColor('--status-orange', '#f59e0b');
        const cRemaining = getThemeColor('--chart-remaining', '#cbd5e1');
        const cText = getThemeColor('--text-secondary', '#64748b');

        if (typeof globalLabChartPro !== 'undefined' && globalLabChartPro) {
            globalLabChartPro.data.labels = ['Сдано', 'Прикреплено', 'Осталось'];
            globalLabChartPro.data.datasets[0].data = [done, attached, remaining];
            globalLabChartPro.data.datasets[0].backgroundColor = [cDone, cAttached, cRemaining];
            globalLabChartPro.options.plugins.legend.labels.color = cText;
            globalLabChartPro.update('none');
        } else {
            const canvas = document.getElementById('labStatsChartPro');
            if (canvas) {
                window.globalLabChartPro = new Chart(canvas.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: ['Сдано', 'Прикреплено', 'Осталось'],
                        datasets: [{
                            data: [done, attached, remaining],
                            backgroundColor: [cDone, cAttached, cRemaining],
                            borderWidth: 0,
                            hoverOffset: 8,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { color: cText } } }
                    }
                });
            }
        }
        renderProLabDetails();
    }

    renderProAvgDetails();

    const select = document.getElementById('proSubjectSelect');
    if (select) {
        let currentVal = select.value;
        select.innerHTML = '';
        let keys = Object.keys(subjectGrades).filter(k => subjectGrades[k].length > 0);

        if (keys.length === 0) {
            select.innerHTML = '<option value="">Нет оцененных работ</option>';
            if (proSubjectChart) { try { proSubjectChart.destroy(); } catch (e) {} proSubjectChart = null; }
            return;
        }

        keys.forEach(k => {
            let opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            select.appendChild(opt);
        });
        if (keys.includes(currentVal)) select.value = currentVal;

        renderProSubjectChart();
    }
}

function renderProLabDetails() {
    const el = document.getElementById('labStatsDetailsPro');
    if (!el) return;

    let currentCourses = moodleStats.filter(c => isCourseInCurrentSchedule(c.name, c.id));
    let subjectStats = {};

    currentCourses.forEach(course => {
        let cleanCourse = course.name.replace(/\([^)]*\)/g, '').trim().toLowerCase();
        let matchingSubjects = new Set();

        cachedSchedule.forEach(item => {
            if (item.type_name !== 'ЛЗ' && item.type_name !== 'ПЗ') return;
            let lessonName = item.lesson.toLowerCase();
            if (cleanCourse.includes(lessonName) || lessonName.includes(cleanCourse)) {
                matchingSubjects.add(`${item.lesson} (${item.type_name})`);
            }
        });

        matchingSubjects.forEach(subj => {
            if (!subjectStats[subj]) subjectStats[subj] = { done: 0, attached: 0, remaining: 0 };
            course.assignments.forEach(a => {
                if (a.type !== 'assign') return;
                if (a.status === 'Сдано') subjectStats[subj].done++;
                else if (a.status === 'На проверке' || a.status === 'Черновик') subjectStats[subj].attached++;
                else subjectStats[subj].remaining++;
            });
        });
    });

    let keys = Object.keys(subjectStats);
    if (keys.length === 0) {
        el.innerHTML = '<div class="text-muted small">Нет данных</div>';
        return;
    }

    let html = '';
    keys.forEach(subj => {
        let st = subjectStats[subj];
        let total = st.done + st.attached + st.remaining;
        if (total === 0) return;
        html += `
            <div class="widget-details-row" title="${escapeHtml(subj)}">
                <span class="widget-details-title">${escapeHtml(subj)}</span>
                <span class="widget-details-nums">
                    <span style="color:var(--chart-lab-done);">${st.done}</span> /
                    <span style="color:var(--status-orange);">${st.attached}</span> /
                    <span style="color:var(--text-muted);">${st.remaining}</span>
                </span>
            </div>`;
    });
    el.innerHTML = html || '<div class="text-muted small">Нет данных</div>';
}

function renderProAvgDetails() {
    const el = document.getElementById('proAvgGradeDetails');
    if (!el) return;

    let subjectStats = {};
    let currentCourses = moodleStats.filter(c => isCourseInCurrentSchedule(c.name, c.id));

    currentCourses.forEach(course => {
        let shortName = course.name.split('(')[0].trim();
        if (!subjectStats[shortName]) subjectStats[shortName] = { sum: 0, count: 0 };
        course.assignments.forEach(act => {
            if (act.grade_num !== null && act.grade_num > 0) {
                subjectStats[shortName].sum += act.grade_num;
                subjectStats[shortName].count++;
            }
        });
    });

    let subjects = Object.keys(subjectStats).filter(k => subjectStats[k].count > 0)
        .sort((a, b) => (subjectStats[b].sum / subjectStats[b].count) - (subjectStats[a].sum / subjectStats[a].count));

    if (subjects.length === 0) {
        el.innerHTML = '<div class="text-muted small">Нет оценок</div>';
        return;
    }

    let html = '';
    subjects.forEach(subj => {
        let avg = (subjectStats[subj].sum / subjectStats[subj].count).toFixed(1);
        html += `
            <div class="widget-details-row" title="${escapeHtml(subj)}">
                <span class="widget-details-title">${escapeHtml(subj)}</span>
                <span class="widget-details-nums">${avg}</span>
            </div>`;
    });
    el.innerHTML = html;
}

function renderProSubjectChart() {
    const select = document.getElementById('proSubjectSelect');
    if (!select || !select.value) return;

    let currentCourses = moodleStats.filter(c => isCourseInCurrentSchedule(c.name, c.id));
    let subjectName = select.value;
    let allLabs = [];

    currentCourses.forEach(course => {
        let shortName = course.name.split('(')[0].trim();
        if (shortName === subjectName) {
            course.assignments.forEach(act => {
                if (act.type === 'assign' && extractLabNum(act.name)) allLabs.push(act);
            });
        }
    });

    let uniqueLabs = {};
    allLabs.forEach(a => {
        let num = extractLabNum(a.name);
        if (!uniqueLabs[num]) uniqueLabs[num] = a;
        else if (a.grade_num && !uniqueLabs[num].grade_num) uniqueLabs[num] = a;
    });

    let sortedNums = Object.keys(uniqueLabs).sort((a, b) => parseFloat(a) - parseFloat(b));
    let sortedLabs = sortedNums.map(n => uniqueLabs[n]);
    let labels = sortedNums.map(n => 'ЛР ' + n);
    let data = sortedLabs.map(a => a.grade_num || null);
    let validGrades = data.filter(x => x !== null);
    let avgGrade = validGrades.length > 0 ? (validGrades.reduce((a, b) => a + b, 0) / validGrades.length) : 0;
    let maxGrade = validGrades.length > 0 ? Math.max(...validGrades) : 100;

    const detailsEl = document.getElementById('proSubjectGradeDetails');
    if (detailsEl) {
        let html = '';
        sortedLabs.forEach(lab => {
            html += `
                <div class="widget-details-row" title="${escapeHtml(lab.name)}">
                    <span class="widget-details-title">${escapeHtml(lab.name)}</span>
                    <span class="widget-details-nums">${lab.grade_num ? lab.grade_num : '—'}</span>
                </div>`;
        });
        detailsEl.innerHTML = html || '<div class="text-muted small">Нет данных</div>';
    }

    if (proSubjectChart) { try { proSubjectChart.destroy(); } catch (e) {} proSubjectChart = null; }
    const canvas = document.getElementById('proSubjectChart');
    if (canvas && canvas.offsetParent !== null) {
        const cAccent = getThemeColor('--accent', '#6366f1');
        const cText = getThemeColor('--text-secondary', '#64748b');
        const cGrid = getThemeColor('--border-color', '#e2e8f0');

        proSubjectChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Балл',
                        data: data,
                        backgroundColor: cAccent,
                        borderRadius: 4,
                        barPercentage: 0.6
                    },
                    {
                        type: 'line',
                        label: 'Соединение',
                        data: data,
                        borderColor: getThemeColor('--chart-lab-done', '#14b8a6'),
                        borderWidth: 2,
                        tension: 0.3,
                        spanGaps: true,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: getThemeColor('--chart-lab-done', '#14b8a6'),
                        pointBorderWidth: 2,
                        pointRadius: 4
                    },
                    {
                        type: 'line',
                        label: 'Среднее',
                        data: Array(labels.length).fill(avgGrade),
                        borderColor: getThemeColor('--status-orange', '#f59e0b'),
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: cText }, grid: { color: cGrid } },
                    y: {
                        min: 50,
                        max: Math.max(100, Math.ceil(maxGrade / 10) * 10),
                        title: { display: true, text: 'Баллы', color: cText },
                        ticks: { color: cText },
                        grid: { color: cGrid }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: getThemeColor('--chart-tooltip-bg', 'rgba(15, 23, 42, 0.92)'),
                        titleColor: getThemeColor('--chart-tooltip-text', '#f8fafc'),
                        bodyColor: getThemeColor('--chart-tooltip-text', '#f8fafc'),
                        callbacks: {
                            label: function (context) {
                                if (context.dataset.label === 'Среднее') return 'Среднее: ' + context.raw.toFixed(1);
                                return context.raw !== null ? 'Балл: ' + context.raw : 'Не сдано';
                            }
                        }
                    }
                }
            }
        });
    }
}

function refreshProChartsTheme() {
    const tooltipOpts = typeof _buildTooltipOpts === 'function' ? _buildTooltipOpts() : {};

    if (typeof globalLabChartPro !== 'undefined' && globalLabChartPro) {
        try {
            const cText = getThemeColor('--text-secondary', '#64748b');
            const cDone = getThemeColor('--chart-lab-done', '#14b8a6');
            const cAttached = getThemeColor('--status-orange', '#f59e0b');
            const cRemaining = getThemeColor('--chart-remaining', '#cbd5e1');
            globalLabChartPro.data.datasets[0].backgroundColor = [cDone, cAttached, cRemaining];
            globalLabChartPro.options.plugins.legend.labels.color = cText;
            if (tooltipOpts.backgroundColor) {
                globalLabChartPro.options.plugins.tooltip = Object.assign({}, globalLabChartPro.options.plugins.tooltip, tooltipOpts);
            }
            globalLabChartPro.update('none');
        } catch (e) { console.error(e); }
    }

    if (proSubjectChart) {
        try {
            const cText = getThemeColor('--text-secondary', '#64748b');
            const cGrid = getThemeColor('--border-color', '#e2e8f0');
            const cAccent = getThemeColor('--accent', '#6366f1');
            const cGreen = getThemeColor('--chart-lab-done', '#14b8a6');
            const cOrange = getThemeColor('--status-orange', '#f59e0b');

            proSubjectChart.data.datasets[0].backgroundColor = cAccent;
            proSubjectChart.data.datasets[1].borderColor = cGreen;
            proSubjectChart.data.datasets[1].pointBorderColor = cGreen;
            proSubjectChart.data.datasets[2].borderColor = cOrange;

            proSubjectChart.options.scales.x.ticks.color = cText;
            proSubjectChart.options.scales.x.grid.color = cGrid;
            proSubjectChart.options.scales.y.ticks.color = cText;
            proSubjectChart.options.scales.y.title.color = cText;
            proSubjectChart.options.scales.y.grid.color = cGrid;

            if (tooltipOpts.backgroundColor) {
                proSubjectChart.options.plugins.tooltip = Object.assign({}, proSubjectChart.options.plugins.tooltip, tooltipOpts);
            }
            proSubjectChart.update('none');
        } catch (e) { console.error(e); }
    }
}

// ============================================================
//  НАСТРОЙКА СЕМЕСТРОВ
// ============================================================

let draggedCourseId = null;

function openMoodleSetupModal() {
    const pastList = document.getElementById('pastSemesterList');
    const currentList = document.getElementById('currentSemesterList');
    if (!pastList || !currentList) return;
    pastList.innerHTML = '';
    currentList.innerHTML = '';

    if (!moodleStats) return;

    moodleStats.forEach(course => {
        const isCurrent = isCourseInCurrentSchedule(course.name, course.id);
        const li = document.createElement('li');
        li.className = 'list-group-item py-2 d-flex justify-content-between align-items-center';
        li.style.cursor = 'grab';
        li.draggable = true;
        li.dataset.id = course.id;
        li.dataset.name = course.name;
        li.innerHTML = `<span class="text-truncate fw-bold small" style="max-width: 100%;" title="${escapeHtml(course.name)}">${escapeHtml(course.name)}</span>`;

        li.addEventListener('dragstart', (e) => {
            draggedCourseId = course.id;
            e.dataTransfer.effectAllowed = 'move';
        });

        if (isCurrent) currentList.appendChild(li);
        else pastList.appendChild(li);
    });

    const modalEl = document.getElementById('moodleSetupModal');
    if (!modalEl) return;
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.show();
}

function allowDrop(ev) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
}

function handleSemesterDrop(ev, targetColumn) {
    ev.preventDefault();
    if (!draggedCourseId) return;
    const targetList = targetColumn === 'current'
        ? document.getElementById('currentSemesterList')
        : document.getElementById('pastSemesterList');
    const draggedEl = document.querySelector(`[data-id="${draggedCourseId}"]`);
    if (draggedEl && targetList) targetList.appendChild(draggedEl);
    draggedCourseId = null;
}

function saveMoodleSetup() {
    const currentList = document.getElementById('currentSemesterList');
    const pastList = document.getElementById('pastSemesterList');
    if (!currentList || !pastList) return;

    let newConfig = {};
    currentList.querySelectorAll('li').forEach(li => { newConfig[li.dataset.id] = 'current'; });
    pastList.querySelectorAll('li').forEach(li => { newConfig[li.dataset.id] = 'past'; });

    moodleSemesterConfig = newConfig;
    localStorage.setItem('moodleSemesterConfig', JSON.stringify(newConfig));

    const modalEl = document.getElementById('moodleSetupModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }
    renderMoodleStats();
    renderProWidgets();
    if (typeof showUpdateNotification === 'function') showUpdateNotification('✅ Семестры обновлены');
}

// Экспорт на window, чтобы inline onclick работал
window.openMoodleModal = openMoodleModal;
window.doMoodleLogin = doMoodleLogin;
window.doMoodleLogout = doMoodleLogout;
window.loadMoodleStats = loadMoodleStats;
window.openMoodleSetupModal = openMoodleSetupModal;
window.saveMoodleSetup = saveMoodleSetup;
window.handleSemesterDrop = handleSemesterDrop;
window.allowDrop = allowDrop;
window.renderProSubjectChart = renderProSubjectChart;
window.syncMoodleDeadlinesToCalendar = syncMoodleDeadlinesToCalendar;
window.syncMoodleToWidgets = syncMoodleToWidgets;

;
// --- main.js ---
// Точка входа.

document.addEventListener("DOMContentLoaded", async () => {
    try {
        showGlobalLoader();

        initSettings();
        initSearch();
        if (typeof initNotesWidget === 'function') initNotesWidget();

        await ensureGroupsLoaded();

        // Автокомплит на поле «Группа» в модалке «Добавить друга».
        initGroupAutocomplete(document.getElementById('friendGroup'));

        // Автокомплит на поле «Группа» в модалке выбора группы.
        // initGroupAutocomplete имеет внутреннюю защиту dataset.acInit —
        // повторный вызов для того же input безопасен.
        const gsInput = document.getElementById('gsGroupInput');
        if (gsInput && typeof initGroupAutocomplete === 'function') {
            initGroupAutocomplete(gsInput);
            window._gsAutocompleteInit = true;
        }

        await refreshTaskDates();

        initNotifications();

        updateScheduleStatus();
        restartStatusTimer();

        const savedGroup = localStorage.getItem('savedGroup');

        if (savedGroup) {
            document.getElementById('groupSelect').value = savedGroup;
            const savedSub = localStorage.getItem('savedSubgroup');
            if (savedSub) document.getElementById('subgroupSelect').value = savedSub;

            if (typeof updateGroupDisplay === 'function') updateGroupDisplay();
            await fetchSemesterData();
            if (typeof checkOnboarding === 'function') checkOnboarding();
        } else {
            // Первый запуск: пустой календарь
            updateWeekDropdown();
            renderCalendar();
            renderCharts();
            renderMiniCalendar();
            renderSyncFreshness();
            hideGlobalLoader();
            fetchFriends();

            if (typeof updateGroupDisplay === 'function') updateGroupDisplay();
            if (typeof checkOnboarding === 'function') checkOnboarding();

            // Мгновенно открываем модалку выбора группы
            if (typeof openGroupSelectModal === 'function') {
                openGroupSelectModal(true);
            }
        }
    } catch (e) {
        console.error(e);
        hideGlobalLoader();
    }
});

function updateDisplayPrefs() {
    showTeacher  = localStorage.getItem('showTeacher')  !== 'false';
    showLocation = localStorage.getItem('showLocation') !== 'false';
    showFriends  = localStorage.getItem('showFriends')  !== 'false';
    renderCalendar();
}

// ============================================================
//  СПРАВОЧНИК ГРУПП
// ------------------------------------------------------------
//  Ретраи (3 попытки, паузы 1с и 2с) + события:
//    ezh:groups-loaded       — успешно, allGroups наполнен
//    ezh:groups-load-failed  — все попытки провалились
//
//  group-select.js и autocomplete.js слушают эти события и
//  перерисовывают подсказку / dropdown.
//
//  Без ретраев был реальный баг: если первый вызов apiLoadGroups()
//  падал (гонка с инициализацией БД / таймаут Flask), groupsLoaded
//  навсегда оставался false, а autocomplete.js вечно показывал
//  «⏳ Загрузка справочника…». Теперь даже при сбое будет 3 попытки.
// ============================================================

async function ensureGroupsLoaded() {
    if (groupsLoaded) return;

    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            let groups = await apiLoadGroups();
            if (groups && Array.isArray(groups)) {
                groups.forEach(g => {
                    let name = typeof g === 'string' ? g : (g.name || g.title || JSON.stringify(g));
                    name = String(name).trim();
                    if (name && !validGroups.has(name.toUpperCase())) {
                        validGroups.add(name.toUpperCase());
                        allGroups.push(name);
                    }
                });
            }
            groupsLoaded = true;
            groupsLoadFailed = false;
            console.log('[groups] loaded', allGroups.length, 'items');
            document.dispatchEvent(new Event('ezh:groups-loaded'));
            return;
        } catch (e) {
            lastErr = e;
            console.warn('[groups] attempt', attempt + 1, 'failed:', (e && e.message) || e);
            if (attempt < 2) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }

    console.error('[groups] all attempts failed:', lastErr);
    groupsLoadFailed = true;
    document.dispatchEvent(new Event('ezh:groups-load-failed'));
}

function _extractHttpStatus(err) {
    if (!err) return null;
    if (typeof err.status === 'number') return err.status;
    const m = /HTTP (\d+)/.exec(err.message || '');
    return m ? parseInt(m[1], 10) : null;
}

function _errorText(err) {
    const status = _extractHttpStatus(err);
    if (status === 429) return 'Слишком много запросов. Подожди минуту и обнови страницу.';
    if (status === 401) return 'Требуется авторизация.';
    if (status >= 500) return 'Ошибка на сервере. Загляни в окно консоли приложения.';
    return 'Не удалось загрузить расписание.';
}

async function fetchSemesterData() {
    const group = document.getElementById("groupSelect").value.trim();
    const subgroup = document.getElementById("subgroupSelect").value;
    if (!group) return;

    showGlobalLoader();
    await ensureGroupsLoaded();

    if (validGroups.size > 0 && !validGroups.has(group.toUpperCase())) {
        hideGlobalLoader();
        let add = confirm(`Группа «${group}» не найдена в справочнике.\n\nДобавить её в вашу базу и попробовать загрузить расписание?`);
        if (!add) return;
        try {
            await apiAddCustomGroup(group);
            validGroups.add(group.toUpperCase());
            allGroups.push(group);
        } catch (e) {
            console.error(e);
            alert('Не удалось добавить группу «' + group + '» в базу: '
                + ((e && e.message) ? e.message : 'неизвестная ошибка'));
        }
        showGlobalLoader();
    }

    localStorage.setItem('savedGroup', group);
    localStorage.setItem('savedSubgroup', subgroup);

    document.getElementById("calendar").innerHTML =
        "<h6 class='text-center w-100 mt-5'>Загрузка семестра...</h6>";

    let scheduleLoaded = false;
    try {
        let [data, customData] = await Promise.all([
            apiLoadSchedule(group, subgroup),
            // Кастомные события не должны ронять загрузку семестра: если
            // /api/custom_schedule отвечает ошибкой, показываем расписание
            // без них, а не «Не удалось загрузить расписание».
            apiLoadCustomSchedule(group).catch(e => {
                console.error("custom schedule failed:", e);
                return [];
            })
        ]);
        customScheduleItems = Array.isArray(customData) ? customData : [];
        cachedSchedule = applyTimeFix(data);
        await Promise.all([
            updateLabsCache(),
            fetchSubjectSettings()
        ]);
        renderCalendar();
        scheduleLoaded = true;
    } catch (e) {
        console.error("fetchSemesterData failed:", e);
        const msg = _errorText(e);
        const status = _extractHttpStatus(e);
        const extra = status ? `<div class="text-muted small mt-2">HTTP ${status}</div>` : '';
        document.getElementById("calendar").innerHTML = `
            <div class="empty-state empty-state-wide">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-title">Не удалось загрузить расписание</div>
                <div class="empty-state-text">${msg}</div>
                ${extra}
            </div>`;
        hideGlobalLoader();
        return;
    }

    if (scheduleLoaded) {
        try { renderCharts(); } catch (e) { console.error("renderCharts failed:", e); }
    }

    hideGlobalLoader();
    fetchFriends();
    updateScheduleStatus();
    refreshNotifications();
    if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications();
    renderSyncFreshness();
    syncSemesterData(group, subgroup);
}

async function syncSemesterData(group, subgroup) {
    try {
        const syncResult = await apiSyncSchedule(group, subgroup);
        let newData = applyTimeFix(syncResult.items);
        const exhausted = !!syncResult.exhausted;

        if (!Array.isArray(newData) || newData.length === 0) {
            if (typeof renderSyncFreshness === 'function') renderSyncFreshness();
            return;
        }

        if (cachedSchedule && cachedSchedule.length > 0
            && newData.length < cachedSchedule.length * 0.9) {
            console.error("Критический сбой СевГУ: попытка затереть расписание.");
            return;
        }

        if (!exhausted && typeof saveSyncTime === 'function') saveSyncTime(group, subgroup);

        if (isScheduleDifferent(newData, cachedSchedule)) {
            cachedSchedule = newData;
            renderCalendar();
            try { renderCharts(); } catch (e) { console.error(e); }
            updateScheduleStatus();
            refreshNotifications();
            if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications();
            showUpdateNotification(exhausted
                ? "Расписание загружено частично — остальное догрузится позже"
                : "Ваше расписание обновлено в фоне");
        }

        if (typeof renderSyncFreshness === 'function') renderSyncFreshness();

        if (typeof syncFriendsSchedules === 'function') {
            syncFriendsSchedules(false).catch(e => console.error('[sync] friends sync failed', e));
        }

    } catch (e) {
        const status = _extractHttpStatus(e);
        if (status === 429) {
            console.warn("[sync] rate-limited, попробуем позже");
            return;
        }
        console.error("Ошибка синхронизации расписания", e);
    }
}
