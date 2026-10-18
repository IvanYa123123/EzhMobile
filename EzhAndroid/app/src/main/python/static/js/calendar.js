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
    if (window._calDir === 'right') cal.classList.add('slide-right');
    else if (window._calDir === 'left') cal.classList.add('slide-left');
    else cal.classList.add('fade-in');
    window._calDir = null;

    if (!currentGroup || cachedSchedule.length === 0) {
        cal.innerHTML = `<div class="empty-state empty-state-wide">
            <div class="empty-state-icon">📚</div>
            <div class="empty-state-title">${currentGroup ? 'Расписание не загружено' : 'Выберите группу'}</div>
        </div>`;
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

    // Клик по колонке = развернуть день (десктоп) / открыть вкладку «День» (мобилка)
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

    if (typeof renderFriendsCalendar === 'function') renderFriendsCalendar();
    if (typeof renderTeachersCalendars === 'function') renderTeachersCalendars();
    if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
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

    // Загружаем заметки конкретно на этот день
    let dayTasks = [];
    try {
        dayTasks = await apiLoadTasks(window.expandedDayDateStr, window.expandedDayDateStr);
    } catch (e) { console.error("Day tasks load failed", e); }

    let html = '';

    // 1. Блок пар и событий
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

    // 2. Блок заметок (полный текст)
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

    // 3. Форма добавления
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
    
    textarea.value = ''; // Очищаем сразу
    try {
        let data = await apiCreateTask({date: dateStr, text: text, status: 'green'});
        taskDatesSet.add(dateStr);
        if (typeof refreshMiniCalEvents === 'function') refreshMiniCalEvents();
        if (typeof refreshMiniCalendar === 'function') refreshMiniCalendar();
        await renderDayView(); // Перерисовываем день
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
