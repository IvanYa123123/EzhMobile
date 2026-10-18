// Друзья: список, порядок, общие пары, корпуса, фоновый синк.

let _currentFriendIndex = 0;

// In-memory копия порядка. Всегда актуальна; localStorage — персистентный бэкап.
let _friendsOrderOverride = null;

// Счётчик поколений. Увеличивается при ротации/перестановке.
// fetchFriends сравнивает свой стартовый номер с текущим и
// игнорирует устаревший ответ.
let _friendsGeneration = 0;

// ============================================================
//  ПОРЯДОК
// ============================================================

function loadFriendsOrder() {
    if (Array.isArray(_friendsOrderOverride)) return _friendsOrderOverride.slice();
    try {
        const raw = localStorage.getItem('friendsOrder');
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function saveFriendsOrder() {
    const ids = friendsList.map(f => f.id);
    _friendsOrderOverride = ids.slice();
    try {
        localStorage.setItem('friendsOrder', JSON.stringify(ids));
    } catch (e) {
        console.warn('[friends] не удалось записать порядок в localStorage:', e);
    }
}

function applyFriendsOrder() {
    let order = loadFriendsOrder();
    if (!Array.isArray(order) || order.length === 0) return;
    friendsList.sort((a, b) => {
        let ai = order.indexOf(a.id); if (ai === -1) ai = Number.MAX_SAFE_INTEGER;
        let bi = order.indexOf(b.id); if (bi === -1) bi = Number.MAX_SAFE_INTEGER;
        return ai - bi;
    });
}

// ============================================================
//  ПРОКРУТКА И ПЕРЕСТАНОВКА
// ============================================================

function rotateFriendsRight() {
    if (!Array.isArray(friendsList) || friendsList.length < 2) return;
    _currentFriendIndex = (_currentFriendIndex + 1) % friendsList.length;
    renderFriendsCalendar();
}

function moveFriendUp() {
    if (!Array.isArray(friendsList) || friendsList.length < 2) return;
    if (_currentFriendIndex <= 0) return;
    _friendsGeneration++;  // отменяем висящие fetch
    const i = _currentFriendIndex;
    [friendsList[i - 1], friendsList[i]] = [friendsList[i], friendsList[i - 1]];
    _currentFriendIndex--;
    saveFriendsOrder();
    renderFriendsCalendar();
}

function moveFriendDown() {
    if (!Array.isArray(friendsList) || friendsList.length < 2) return;
    if (_currentFriendIndex >= friendsList.length - 1) return;
    _friendsGeneration++;
    const i = _currentFriendIndex;
    [friendsList[i], friendsList[i + 1]] = [friendsList[i + 1], friendsList[i]];
    _currentFriendIndex++;
    saveFriendsOrder();
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

    applyFriendsOrder();
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
// ============================================================

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
        if (editingFriendId) await apiUpdateFriend(editingFriendId, {name, group, subgroup, category: ''});
        else await apiCreateFriend({name, group, subgroup, category: ''});
    } catch (e) { return alert("Не удалось сохранить"); }
    bootstrap.Modal.getInstance(document.getElementById('addFriendModal')).hide();
    await fetchFriends();
}

async function deleteFriend(id) {
    if (!confirm("Удалить друга?")) return;
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

    const isFirst = _currentFriendIndex === 0;
    const isLast  = _currentFriendIndex === friendsList.length - 1;

    let header = document.createElement('div');
    header.className = "fw-bold text-primary mb-2 ps-1 pt-1 friend-header-row d-flex align-items-center justify-content-between";
    header.innerHTML = `
        <span>👤 ${escapeHtml(friend.name)} <span class="text-muted small fw-normal ms-1">(${escapeHtml(friend.group)})</span></span>
        <div class="d-flex align-items-center gap-1">
            <span class="text-muted small me-1">${_currentFriendIndex + 1} / ${friendsList.length}</span>
            <button class="btn btn-sm btn-link text-secondary p-0 text-decoration-none" style="width: 20px;" title="Выше" onclick="moveFriendUp()" ${isFirst ? 'disabled' : ''}>↑</button>
            <button class="btn btn-sm btn-link text-secondary p-0 me-1 text-decoration-none" style="width: 20px;" title="Ниже" onclick="moveFriendDown()" ${isLast ? 'disabled' : ''}>↓</button>
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

                    let lessonHtml = lessonLink
                        ? `<a href="${lessonLink}" target="_blank" class="text-decoration-none fw-bold" style="color: var(--accent);" title="${escapeHtml(fItem.lesson)}">${escapeHtml(displayLesson)}</a>`
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
