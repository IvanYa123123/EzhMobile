let teachersAllList = null;
let trackedTeachers = [];
let teacherSchedulesCache = {};
let _teacherInitDone = false;
let _currentTeacherIndex = 0;

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
        teachersAllList = await resp.json();
    } catch (e) { teachersAllList = []; }
    return teachersAllList;
}

async function fetchTrackedTeachers() {
    try {
        const resp = await fetch('/api/tracked_teachers');
        trackedTeachers = await resp.json();
    } catch (e) { trackedTeachers = []; }
    if (_currentTeacherIndex >= trackedTeachers.length) _currentTeacherIndex = 0;
}

async function fetchAllTeacherSchedules() {
    const promises = trackedTeachers.map(t => loadTeacherSchedule(t.slug));
    await Promise.all(promises);
}

async function loadTeacherSchedule(slug, force) {
    if (teacherSchedulesCache[slug] && !force) return teacherSchedulesCache[slug];
    try {
        const resp = await fetch('/api/teacher_schedule?slug=' + encodeURIComponent(slug) + (force ? '&force=1' : ''));
        teacherSchedulesCache[slug] = await resp.json();
        return teacherSchedulesCache[slug];
    } catch (e) { teacherSchedulesCache[slug] = []; return []; }
}

async function showAddTeacherModal() {
    document.getElementById('teacherAddInput').value = '';
    document.getElementById('teacherAddSuggestions').innerHTML = '';
    new bootstrap.Modal(document.getElementById('addTeacherModal')).show();
    await ensureAllTeachersLoaded();
    renderTeacherSuggestions('');
}

function onTeacherSearchInput(value) { renderTeacherSuggestions(value); }

function renderTeacherSuggestions(query) {
    const container = document.getElementById('teacherAddSuggestions');
    if (!teachersAllList || teachersAllList.length === 0) { container.innerHTML = '<div class="text-center small">Загрузка…</div>'; return; }
    const q = (query || '').trim().toLowerCase();
    const trackedSlugs = new Set(trackedTeachers.map(t => t.slug));
    let filtered = q.length < 2 ? teachersAllList.slice(0, 30) : teachersAllList.filter(t => t.name.toLowerCase().includes(q)).slice(0, 50);
    container.innerHTML = filtered.map(t => {
        const isTracked = trackedSlugs.has(t.slug);
        return `<div class="teacher-suggestion ${isTracked ? 'disabled' : ''}" ${isTracked ? '' : `onclick="addTrackedTeacher('${escapeJsString(t.slug)}', '${escapeJsString(t.name)}')"`}><span>${escapeHtml(t.name)}</span>${isTracked ? '<span class="badge bg-secondary">добавлен</span>' : '<span class="teacher-suggestion-arrow">+</span>'}</div>`;
    }).join('');
}

async function addTrackedTeacher(slug, name) {
    try {
        await fetch('/api/tracked_teachers', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, slug}) });
    } catch (e) { return alert('Не удалось добавить'); }
    bootstrap.Modal.getInstance(document.getElementById('addTeacherModal')).hide();
    await fetchTrackedTeachers();
    renderTeachersCalendars();
    loadTeacherSchedule(slug).then(() => renderTeachersCalendars());
}

async function deleteTrackedTeacher(id) {
    if (!confirm(`Убрать преподавателя?`)) return;
    try {
        await fetch('/api/tracked_teachers/' + id, {method: 'DELETE'});
        if (_currentTeacherIndex >= trackedTeachers.length - 1 && _currentTeacherIndex > 0) _currentTeacherIndex--;
        await fetchTrackedTeachers();
        renderTeachersCalendars();
    } catch (e) {}
}

function renderTeachersCalendars() {
    const container = document.getElementById('teachersCalendarsContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!trackedTeachers || trackedTeachers.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎓</div><div class="empty-state-title">Пока никого нет</div><div class="empty-state-text">Нажмите «+».</div></div>`;
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
        const dayPairs = pairs.filter(p => p.date === dateStr);
        const isToday = dateStr === realTodayStr ? ' day-today' : '';
        let html = `<div class="teacher-col${isToday}"><div class="teacher-day-header">${displayDate}</div>`;
        if (dayPairs.length === 0) html += '<div class="text-muted text-center mt-2" style="font-size:0.8em;">—</div>';
        else dayPairs.forEach(p => { html += `<div class="teacher-pair-card" onclick="toggleTeacherPairDetails(this)"><div class="teacher-pair-head"><strong class="text-primary">${escapeHtml(p.time_range)}</strong></div><div class="teacher-pair-details" hidden><div>${escapeHtml(p.lesson)}</div></div></div>`; });
        html += `</div>`;
        dayParts.push(html);
    }
    grid.innerHTML = dayParts.join('');
    wrapper.appendChild(grid);
    container.appendChild(wrapper);
}

function toggleTeacherPairDetails(cardEl) {
    const details = cardEl.querySelector('.teacher-pair-details');
    if (details) details.hidden = !details.hidden;
}

async function teacherRefresh(slug) {
    await loadTeacherSchedule(slug, true);
    renderTeachersCalendars();
}
