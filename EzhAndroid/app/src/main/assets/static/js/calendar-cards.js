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
                    <strong class="text-primary schedule-item-time-text">${escapeHtml(ev.time_range)}</strong>
                    <span class="schedule-item-edit"
                          onclick="openCustomScheduleModal('${ev.date}', ${ev.custom_id})"
                          title="Редактировать">✏️</span>
                </span>
                <span class="schedule-item-type schedule-item-type-event">Событие</span>
            </div>
            <div class="schedule-item-title">${escapeHtml(ev.lesson)}</div>
            ${teacherHtml}
            ${locationHtml}
            <div class="schedule-item-footer"><span class="add-task-btn"
                  onclick="createTaskFromSchedule('${ev.date}', '${safeSubject}')">+ Заметка</span></div>
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

    // Тип занятия — жирным в правом верхнем углу, без серой рамки/бейджа.
    const pairNum = (!item.is_custom && item.n)
        ? `<span class="schedule-item-num">${escapeHtml(String(item.n))}.</span> ` : '';
    let typeHtml = '';
    if (item.is_custom && item.is_event) {
        typeHtml = `<span class="schedule-item-type schedule-item-type-event">Событие</span>`;
    } else if (item.type_name) {
        typeHtml = `<span class="schedule-item-type">${escapeHtml(item.type_name)}</span>`;
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
                    ${pairNum}<strong class="text-primary schedule-item-time-text">${escapeHtml(item.time_range)}</strong>
                    ${editIconHtml}
                </span>
                ${typeHtml}
            </div>
            <div class="schedule-item-title">${lessonHtml}</div>
            ${teacherHtml}
            ${locationHtml}
            <div class="schedule-item-footer"><span class="add-task-btn" onclick="createTaskFromSchedule('${item.date}', '${safeTaskSubject}')">+ Заметка</span></div>
        </div>
    `;
}
