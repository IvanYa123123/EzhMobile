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
        if (match) items.push({ is_custom: true, custom_id: item.id, base_date: item.base_date, recurrence: item.recurrence, exceptions: item.exceptions, is_event: item.is_event === 1, date: dateStr, time_range: item.time_range, lesson: item.lesson, type_name: item.type_name, teacher: item.teacher, location: item.location });
    });
    return items;
}

function _sortItemsByTime(a, b) {
    let aTime = a.time_range ? a.time_range.split(' - ')[0] : "99:99";
    let bTime = b.time_range ? b.time_range.split(' - ')[0] : "99:99";
    return aTime.localeCompare(bTime);
}

async function renderCalendar() {
    const cal = document.getElementById("calendar");
    if (!cal) return;
    cal.innerHTML = "";
    
    let startStr = getLocalDateStr(currentBaseDate);
    let endD = new Date(currentBaseDate); endD.setDate(endD.getDate() + 6);
    let endStr = getLocalDateStr(endD);
    let realTodayStr = getLocalDateStr(new Date());
    const currentGroup = (document.getElementById('groupSelect')?.value || '').trim();

    if (!currentGroup || cachedSchedule.length === 0) {
        cal.innerHTML = `<div class="empty-state empty-state-wide"><div class="empty-state-icon">📚</div><div class="empty-state-title">${currentGroup ? 'Расписание не загружено' : 'Выберите группу'}</div></div>`;
        return;
    }

    const scheduleByDate = new Map();
    cachedSchedule.forEach(it => {
        if (!scheduleByDate.has(it.date)) scheduleByDate.set(it.date, []);
        scheduleByDate.get(it.date).push(it);
    });

    const htmlParts = [];
    for (let i = 0; i < 7; i++) {
        let d = new Date(currentBaseDate); d.setDate(d.getDate() + i);
        let dateStr = getLocalDateStr(d);
        let displayDate = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
        let isTodayClass = (dateStr === realTodayStr) ? "day-today" : "";

        let pairItems = scheduleByDate.get(dateStr) || [];
        let eventItems = getCustomItemsForDate(dateStr).filter(x => x.is_event);
        
        htmlParts.push(`
            <div class="day-col ${isTodayClass}" id="day-col-${dateStr}" onclick="openDayMode('${dateStr}')">
                <div class="day-header"><span class="day-nav-center">${displayDate}</span></div>
                <div class="day-schedule-wrap mb-2">
                    ${pairItems.length > 0 ? `<div class="schedule-summary shadow-sm">🕒 ${pairItems.length} пар</div>` : ''}
                    ${eventItems.length > 0 ? `<div class="badge bg-success w-100 mb-1">Событий: ${eventItems.length}</div>` : ''}
                    ${pairItems.length === 0 && eventItems.length === 0 ? `<div class="empty-state-inline">☕ Свободно</div>` : ''}
                </div>
                <div id="tasks-${dateStr}" class="mt-2"></div>
            </div>`);
    }
    cal.innerHTML = htmlParts.join('');

    try {
        let tasks = await apiLoadTasks(startStr, endStr);
        if (typeof renderTasksStaggered === 'function') renderTasksStaggered(tasks);
    } catch (e) { console.error(e); }

    if (typeof renderFriendsCalendar === 'function') renderFriendsCalendar();
    if (typeof renderTeachersCalendars === 'function') renderTeachersCalendars();
    if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
    if (typeof checkOnboarding === 'function') checkOnboarding();
}

function renderDayView() {
    const container = document.getElementById('dayViewContent');
    const title = document.getElementById('dayViewTitle');
    if (!container || !window.expandedDayDateStr) return;

    let [y, m, d] = window.expandedDayDateStr.split('-').map(Number);
    let dateObj = new Date(y, m - 1, d);
    title.textContent = dateObj.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

    let pairItems = cachedSchedule.filter(x => x.date === window.expandedDayDateStr).sort(_sortItemsByTime);
    let eventItems = getCustomItemsForDate(window.expandedDayDateStr).filter(x => x.is_event);
    let allItems = eventItems.concat(pairItems);

    if (allItems.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Пар нет</div><div class="text-muted small mt-2">Отдыхаем!</div></div>`;
    } else {
        let html = '';
        allItems.forEach(item => {
            let isEvent = item.is_event;
            let typeBadge = isEvent ? 'Событие' : (item.type_name || 'Пара');
            let bgColor = isEvent ? 'var(--event-color)' : 'var(--accent)';
            html += `
                <div class="schedule-item shadow-sm mb-3" style="border-left: 4px solid ${bgColor}; padding: 12px;">
                    <div class="d-flex justify-content-between mb-2">
                        <strong class="text-primary" style="font-size: 1.1rem;">${item.time_range}</strong>
                        <span class="badge bg-secondary">${typeBadge}</span>
                    </div>
                    <div class="fw-bold mb-1" style="font-size: 1.1rem;">${escapeHtml(item.lesson)}</div>
                    ${item.teacher ? `<div class="text-muted small">👤 ${escapeHtml(item.teacher)}</div>` : ''}
                    ${item.location ? `<div class="text-muted small">🚪 ${escapeHtml(item.location)}</div>` : ''}
                </div>`;
        });
        container.innerHTML = html;
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
