let _currentFriendIndex = 0;

function saveFriendsOrder() {
    const ids = friendsList.map(f => f.id);
    try { localStorage.setItem('friendsOrder', JSON.stringify(ids)); } catch (e) {}
}

function applyFriendsOrder() {
    let order = null;
    try { order = JSON.parse(localStorage.getItem('friendsOrder')); } catch (e) {}
    if (!Array.isArray(order) || order.length === 0) return;
    friendsList.sort((a, b) => {
        let ai = order.indexOf(a.id); if (ai === -1) ai = Number.MAX_SAFE_INTEGER;
        let bi = order.indexOf(b.id); if (bi === -1) bi = Number.MAX_SAFE_INTEGER;
        return ai - bi;
    });
}

function rotateFriendsRight() {
    if (!Array.isArray(friendsList) || friendsList.length < 2) return;
    _currentFriendIndex = (_currentFriendIndex + 1) % friendsList.length;
    renderFriendsCalendar();
}

async function fetchFriends() {
    const loader = document.getElementById('friendsLoader');
    if (loader) loader.style.display = 'block';

    let list = [];
    try { list = await apiLoadFriends(); } catch (e) { list = []; }

    friendsList = Array.isArray(list) ? list : [];
    applyFriendsOrder();
    if (_currentFriendIndex >= friendsList.length) _currentFriendIndex = 0;

    await fetchAllFriendsSchedules();
    renderFriendsCalendar();
    
    if (loader) loader.style.display = 'none';
}

async function fetchAllFriendsSchedules() {
    let promises = friendsList.map(async (friend) => {
        if (!friendsSchedules[friend.id]) {
            try {
                let data = await apiLoadSchedule(friend.group, friend.subgroup);
                friendsSchedules[friend.id] = applyTimeFix(data);
            } catch (e) {
                friendsSchedules[friend.id] = [];
            }
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
            if (Array.isArray(newData) && newData.length > 0) {
                if (friendsSchedules[friend.id] && friendsSchedules[friend.id].length > 0
                    && newData.length < friendsSchedules[friend.id].length * 0.9) {
                    continue;
                }
                if (isScheduleDifferent(newData, friendsSchedules[friend.id])) {
                    friendsSchedules[friend.id] = newData;
                    if (friendsList[_currentFriendIndex] && friendsList[_currentFriendIndex].id === friend.id) {
                        renderFriendsCalendar();
                        showUpdateNotification(`Расписание друга обновилось: ${friend.name}`);
                    }
                }
            }
        } catch (e) {}
    }
}

function showAddFriendModal() {
    editingFriendId = null;
    document.querySelector('#addFriendModal .modal-title').textContent = 'Добавить друга';
    document.getElementById('friendName').value = '';
    document.getElementById('friendGroup').value = '';
    document.getElementById('friendSubgroup').value = '0';
    new bootstrap.Modal(document.getElementById('addFriendModal')).show();
}

function editFriend(id, name, group, subgroup) {
    editingFriendId = id;
    document.querySelector('#addFriendModal .modal-title').textContent = 'Редактировать друга';
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
    let myGroup = (document.getElementById('groupSelect').value || '').trim();
    let mySubgroup = String(document.getElementById('subgroupSelect').value || '0');
    if (myGroup && group.toLowerCase() === myGroup.toLowerCase() && String(subgroup) === mySubgroup) {
        return alert("Друг в той же группе, что и вы");
    }

    try {
        if (editingFriendId) {
            await apiUpdateFriend(editingFriendId, {name, group, subgroup, category: ''});
        } else {
            await apiCreateFriend({name, group, subgroup, category: ''});
        }
    } catch (e) { return alert("Не удалось сохранить друга"); }

    bootstrap.Modal.getInstance(document.getElementById('addFriendModal')).hide();
    await fetchFriends();
}

async function deleteFriend(id) {
    if (!confirm("Вы уверены, что хотите удалить этого друга?")) return;
    try {
        await apiDeleteFriend(id);
        if (_currentFriendIndex >= friendsList.length - 1 && _currentFriendIndex > 0) {
            _currentFriendIndex--;
        }
        await fetchFriends();
    } catch (e) { console.error(e); }
}

function _allPairsMatch(myDaySchedule, friendDaySchedule) {
    if (myDaySchedule.length === 0) return false;
    return myDaySchedule.every(myItem =>
        friendDaySchedule.some(fItem =>
            myItem.time_range === fItem.time_range && myItem.lesson === fItem.lesson &&
            (myItem.location || '').trim().toLowerCase() === (fItem.location || '').trim().toLowerCase()
        )
    );
}

function renderFriendsCalendar() {
    let container = document.getElementById("friendsCalendarsContainer");
    if (!container) return;
    container.innerHTML = '';

    if (!friendsList || friendsList.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-title">Пока никого нет</div><div class="empty-state-text">Нажмите «+ Добавить друга».</div></div>`;
        return;
    }

    const friend = friendsList[_currentFriendIndex];
    let friendSched = friendsSchedules[friend.id] || [];
    let realTodayStr = getLocalDateStr(new Date());

    let wrapper = document.createElement('div');
    wrapper.className = "friend-wrapper bg-white rounded shadow-sm px-2 pb-2 pt-1";

    let header = document.createElement('div');
    header.className = "fw-bold text-primary mb-2 ps-1 pt-1 friend-header-row d-flex align-items-center justify-content-between";
    header.innerHTML = `
        <span>👤 ${escapeHtml(friend.name)} <span class="text-muted small fw-normal ms-1">(${escapeHtml(friend.group)})</span></span>
        <div>
            <span class="text-muted small me-2">${_currentFriendIndex + 1} / ${friendsList.length}</span>
            <button class="btn btn-sm btn-link text-primary p-0 me-2 text-decoration-none" onclick="editFriend(${friend.id}, '${escapeJsString(friend.name)}', '${escapeJsString(friend.group)}', '${friend.subgroup}')" title="Редактировать">✏️</button>
            <button class="btn btn-sm btn-link text-danger p-0 text-decoration-none" onclick="deleteFriend(${friend.id})" title="Удалить">🗑️</button>
        </div>`;
    wrapper.appendChild(header);

    let grid = document.createElement('div');
    grid.className = "calendar-grid w-100";

    const dayParts = [];
    for (let i = 0; i < 7; i++) {
        let d = new Date(currentBaseDate); d.setDate(d.getDate() + i);
        let dateStr = getLocalDateStr(d);
        let displayDate = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
        let daySchedule = friendSched.filter(item => item.date === dateStr).sort((a, b) => a.n - b.n);
        let myDaySchedule = cachedSchedule.filter(item => item.date === dateStr).sort((a, b) => a.n - b.n);
        let isTodayClass = (dateStr === realTodayStr) ? " day-today" : "";
        
        let html = `<div class="friend-col${isTodayClass}"><div class="friend-day-header">${displayDate}</div>`;

        if (daySchedule.length > 0) {
            let fStart = fixTime(daySchedule[0].time_range.split(' - ')[0]);
            let fEnd = fixTime(daySchedule[daySchedule.length - 1].time_range.split(' - ')[1]);
            html += `<div class="fw-bold text-primary mb-2 text-center border-bottom pb-1" style="font-size: 0.8em;">🕒 ${fStart} - ${fEnd}</div>`;

            if (_allPairsMatch(myDaySchedule, daySchedule)) {
                html += `<div class="shared-class shared-common fw-bold">🤝 Все пары совпадают</div>`;
            } else {
                daySchedule.forEach(fItem => {
                    let match = myDaySchedule.find(myItem => myItem.time_range === fItem.time_range && myItem.lesson === fItem.lesson);
                    if (match) html += `<div class="shared-class shared-common fw-bold">🤝 Общая пара в ${fixTime(fItem.time_range.split(' - ')[0])}</div>`;
                });
            }

            if (showFriends) {
                html += `<div class="mt-2 border-top pt-2">`;
                daySchedule.forEach(fItem => {
                    let typeBadge = fItem.type_name ? `<span class="badge bg-secondary" style="font-size: 0.7em;">${escapeHtml(fItem.type_name)}</span>` : '';
                    html += `
                        <div class="schedule-item shadow-sm" style="border-left: 3px solid var(--border-color);">
                            <div class="schedule-item-top"><span class="schedule-item-time"><strong class="text-primary">${fixTime(fItem.time_range)}</strong></span></div>
                            ${typeBadge ? `<div class="schedule-item-badge">${typeBadge}</div>` : ''}
                            <div class="schedule-item-title">${escapeHtml(fItem.lesson)}</div>
                            ${showTeacher && fItem.teacher ? `<div class="schedule-item-teacher">${escapeHtml(fItem.teacher)}</div>` : ''}
                            ${showLocation && fItem.location ? `<div class="schedule-item-location">${escapeHtml(fItem.location)}</div>` : ''}
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
