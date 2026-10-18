let _currentFriendIndex = 0;

function saveFriendsOrder() {}
function applyFriendsOrder() {}

function rotateFriendsRight() {
    if (!Array.isArray(friendsList) || friendsList.length < 2) return;
    _currentFriendIndex = (_currentFriendIndex + 1) % friendsList.length;
    renderFriendsCalendar();
}

async function fetchFriends() {
    let list = [];
    try { list = await apiLoadFriends(); } catch (e) { list = []; }
    friendsList = Array.isArray(list) ? list : [];
    if (_currentFriendIndex >= friendsList.length) _currentFriendIndex = 0;
    await fetchAllFriendsSchedules();
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
        if (_currentFriendIndex >= friendsList.length - 1 && _currentFriendIndex > 0) _currentFriendIndex--;
        await fetchFriends();
    } catch (e) {}
}

function renderFriendsCalendar() {
    let container = document.getElementById("friendsCalendarsContainer");
    if (!container) return;
    container.innerHTML = '';

    if (!friendsList || friendsList.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-title">Пока никого нет</div><div class="empty-state-text">Нажмите «+».</div></div>`;
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
            <button class="btn btn-sm btn-link text-primary p-0 me-2 text-decoration-none" onclick="editFriend(${friend.id}, '${escapeJsString(friend.name)}', '${escapeJsString(friend.group)}', '${friend.subgroup}')">✏️</button>
            <button class="btn btn-sm btn-link text-danger p-0 text-decoration-none" onclick="deleteFriend(${friend.id})">🗑️</button>
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
            html += `<div class="fw-bold text-primary mb-2 text-center border-bottom pb-1" style="font-size: 0.8em;">🕒 ${fixTime(daySchedule[0].time_range.split(' - ')[0])}</div>`;
            daySchedule.forEach(fItem => {
                html += `<div class="schedule-item shadow-sm" style="border-left: 3px solid var(--border-color); padding: 4px;"><div class="schedule-item-title">${escapeHtml(fItem.lesson)}</div></div>`;
            });
        } else {
            html += `<div class="text-muted text-center mt-2" style="font-size: 0.8em;">—</div>`;
        }
        html += `</div>`;
        dayParts.push(html);
    }
    grid.innerHTML = dayParts.join('');
    wrapper.appendChild(grid);
    container.appendChild(wrapper);
}
