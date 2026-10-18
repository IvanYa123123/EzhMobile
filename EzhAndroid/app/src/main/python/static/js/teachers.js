let teachersAllList = null;
let trackedTeachers = [];
let teacherSchedulesCache = {};
let _teacherInitDone = false;
let _currentTeacherIndex = 0;

function saveTeachersOrder() {
    const ids = trackedTeachers.map(t => t.id);
    try { localStorage.setItem('teachersOrder', JSON.stringify(ids)); } catch (e) {}
}

function applyTeachersOrder() {
    let order = null;
    try { order = JSON.parse(localStorage.getItem('teachersOrder')); } catch (e) {}
    if (!Array.isArray(order) || order.length === 0) return;
    trackedTeachers.sort((a, b) => {
        let ai = order.indexOf(a.id); if (ai === -1) ai = Number.MAX_SAFE_INTEGER;
        let bi = order.indexOf(b.id); if (bi === -1) bi = Number.MAX_SAFE_INTEGER;
        return ai - bi;
    });
}

function rotateTeachersRight() {
    if (!Array.isArray(trackedTeachers) || trackedTeachers.length < 2) return;
    _currentTeacherIndex = (_currentTeacherIndex + 1) % trackedTeachers.length;
    renderTeachersCalendars();
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (_teacherInitDone) return;
        _teacherInitDone = true;
        initTeachers();
    }, 900);
});

async function initTeachers() {
    await fetchTrackedTeachers();
    renderTeachersCalendars();
    fetchAllTeacherSchedules().then(() => renderTeachersCalendars());
}

async function ensureAllTeachersLoaded() {
    if (teachersAllList) return teachersAllList;
    try {
        const resp = await fetch('/api/teachers');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        teachersAllList = await resp.json();
    } catch (e) { teachersAllList = []; }
    return teachersAllList;
}

async function fetchTrackedTeachers() {
    let list = [];
    try {
        const resp = await fetch('/api/tracked_teachers');
        if (resp.ok) list = await resp.json();
    } catch (e) {}

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
        const resp = await fetch(url);
        const data = await resp.json();
        teacherSchedulesCache[slug] = Array.isArray(data) ? data : [];
        return teacherSchedulesCache[slug];
    } catch (e) {
        teacherSchedulesCache[slug] = [];
        return [];
    }
}

async function showAddTeacherModal() {
    const inp = document.getElementById('teacherAddInput');
    const sugg = document.getElementById('teacherAddSuggestions');
    if (inp) inp.value = '';
    if (sugg) sugg.innerHTML = '';

    new bootstrap.Modal(document.getElementById('addTeacherModal')).show();

    await ensureAllTeachersLoaded();
    renderTeacherSuggestions('');

    setTimeout(() => { if (inp) inp.focus(); }, 200);
}

function onTeacherSearchInput(value) {
    renderTeacherSuggestions(value);
}

function renderTeacherSuggestions(query) {
    const container = document.getElementById('teacherAddSuggestions');
    if (!container) return;
    if (!teachersAllList || teachersAllList.length === 0) {
        container.innerHTML = '<div class="text-center text-muted small py-3">Список загружается…</div>';
        return;
    }

    const q = (query || '').trim().toLowerCase();
    const trackedSlugs = new Set(trackedTeachers.map(t => t.slug));
    let filtered = q.length < 2 ? teachersAllList.slice(0, 30) : teachersAllList.filter(t => (t.name || '').toLowerCase().includes(q)).slice(0, 50);

    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center text-muted small py-3">Ничего не найдено</div>';
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
    try {
        const resp = await fetch('/api/tracked_teachers', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, slug})
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data && data.id) {
            _currentTeacherIndex = trackedTeachers.length; // Переключаем на нового
        }
    } catch (e) { alert('Не удалось добавить'); return; }

    bootstrap.Modal.getInstance(document.getElementById('addTeacherModal')).hide();
    await fetchTrackedTeachers();
    renderTeachersCalendars();
    loadTeacherSchedule(slug).then(() => renderTeachersCalendars());
    if (typeof showUpdateNotification === 'function') showUpdateNotification(`Добавлен: ${name}`);
}

async function deleteTrackedTeacher(id) {
    if (!confirm(`Убрать преподавателя из списка?`)) return;
    try {
        await fetch('/api/tracked_teachers/' + id, {method: 'DELETE'});
        if (_currentTeacherIndex >= trackedTeachers.length - 1 && _currentTeacherIndex > 0) _currentTeacherIndex--;
        await fetchTrackedTeachers();
        renderTeachersCalendars();
    } catch (e) { alert('Не удалось удалить'); }
}

function renderTeachersCalendars() {
    const container = document.getElementById('teachersCalendarsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!trackedTeachers || trackedTeachers.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎓</div><div class="empty-state-title">Пока никого нет</div><div class="empty-state-text">Нажмите «+ Добавить преподавателя».</div></div>`;
        return;
    }

    const teacher = trackedTeachers[_currentTeacherIndex];
    const pairs = teacherSchedulesCache[teacher.slug] || [];
    const isLoading = !(teacher.slug in teacherSchedulesCache);
    const realTodayStr = getLocalDateStr(new Date());

    const wrapper = document.createElement('div');
    wrapper.className = 'teacher-wrapper bg-white rounded shadow-sm px-2 pb-2 pt-1';

    const header = document.createElement('div');
    header.className = 'fw-bold text-primary mb-2 ps-1 pt-1 teacher-header-row d-flex align-items-center justify-content-between';
    header.innerHTML = `
        <span>🎓 ${escapeHtml(teacher.name)}</span>
        <div>
            <span class="text-muted small me-2">${_currentTeacherIndex + 1} / ${trackedTeachers.length}</span>
            <button class="btn btn-sm btn-link text-primary p-0 me-2 text-decoration-none" onclick="teacherRefresh('${escapeJsString(teacher.slug)}')" title="Обновить">🔄</button>
            <button class="btn btn-sm btn-link text-danger p-0 text-decoration-none" onclick="deleteTrackedTeacher(${teacher.id})" title="Удалить">🗑️</button>
        </div>`;
    wrapper.appendChild(header);

    if (isLoading) {
        const loadDiv = document.createElement('div');
        loadDiv.className = 'text-center text-muted small py-3';
        loadDiv.textContent = 'Загрузка расписания…';
        wrapper.appendChild(loadDiv);
        container.appendChild(wrapper);
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'calendar-grid w-100';

    const dayParts = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(currentBaseDate);
        d.setDate(d.getDate() + i);
        const dateStr = getLocalDateStr(d);
        const displayDate = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
        const dayPairs = pairs.filter(p => p.date === dateStr).sort((a, b) => (a.n || 0) - (b.n || 0));
        const isToday = dateStr === realTodayStr ? ' day-today' : '';

        let html = `<div class="teacher-col${isToday}">`;
        html += `<div class="teacher-day-header">${displayDate}</div>`;

        if (dayPairs.length === 0) {
            html += '<div class="text-muted text-center mt-2" style="font-size:0.8em;">—</div>';
        } else {
            dayPairs.forEach(p => {
                const badge = p.type_name ? `<span class="badge bg-secondary ms-1" style="font-size:0.6em;">${escapeHtml(p.type_name)}</span>` : '';
                const locHtml = p.location ? `<div class="teacher-pair-location">🚪 ${escapeHtml(p.location)}</div>` : '';
                const groupsHtml = (p.groups && p.groups.length) ? `<div class="text-muted" style="font-size:0.85em;">${p.groups.map(g => escapeHtml(g)).join(', ')}</div>` : '';

                html += `
                    <div class="teacher-pair-card" onclick="toggleTeacherPairDetails(this)" title="Показать/скрыть подробности">
                        <div class="teacher-pair-head"><strong class="text-primary">${escapeHtml(p.time_range)}</strong>${badge}<span class="teacher-pair-toggle">▼</span></div>
                        ${locHtml}
                        <div class="teacher-pair-details" hidden><div>${escapeHtml(p.lesson)}</div>${groupsHtml}</div>
                    </div>`;
            });
        }
        html += `</div>`;
        dayParts.push(html);
    }
    grid.innerHTML = dayParts.join('');
    wrapper.appendChild(grid);
    container.appendChild(wrapper);
}

function toggleTeacherPairDetails(cardEl) {
    if (!cardEl) return;
    const details = cardEl.querySelector('.teacher-pair-details');
    if (!details) return;
    details.hidden = !details.hidden;
    cardEl.classList.toggle('is-details-open', !details.hidden);
}

async function teacherRefresh(slug) {
    await loadTeacherSchedule(slug, true);
    renderTeachersCalendars();
    if (typeof showUpdateNotification === 'function') showUpdateNotification('Расписание преподавателя обновлено');
}
