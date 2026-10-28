// Точка входа.

document.addEventListener("DOMContentLoaded", async () => {
    try {
        showGlobalLoader();

        initSettings();
        initSearch();
        if (typeof initNotesWidget === 'function') initNotesWidget();

        await ensureGroupsLoaded();
        initGroupAutocomplete(document.getElementById('groupSelect'));
        initGroupAutocomplete(document.getElementById('friendGroup'));

        await refreshTaskDates();

        initNotifications();

        updateScheduleStatus();
        restartStatusTimer();

        if (localStorage.getItem('savedGroup')) {
            document.getElementById('groupSelect').value = localStorage.getItem('savedGroup');
            if (localStorage.getItem('savedSubgroup')) {
                document.getElementById('subgroupSelect').value = localStorage.getItem('savedSubgroup');
            }
            await fetchSemesterData();
        } else {
            updateWeekDropdown();
            renderCalendar();
            renderCharts();
            renderMiniCalendar();
            renderSyncFreshness();
            hideGlobalLoader();
            fetchFriends();
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

async function ensureGroupsLoaded() {
    if (groupsLoaded) return;
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
    } catch (e) { console.log("Справочник групп недоступен."); }
}

function _extractHttpStatus(err) {
    if (!err) return null;
    if (typeof err.status === 'number') return err.status;
    const m = /HTTP (\d+)/.exec(err.message || '');
    return m ? parseInt(m[1], 10) : null;
}

function _errorText(err) {
    const status = _extractHttpStatus(err);
    if (status === 429) {
        return 'Слишком много запросов. Подожди минуту и обнови страницу.';
    }
    if (status === 401) {
        return 'Требуется авторизация.';
    }
    if (status >= 500) {
        return 'Ошибка на сервере. Загляни в окно консоли приложения.';
    }
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
        } catch (e) { console.error(e); }
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
            apiLoadCustomSchedule(group)
        ]);
        customScheduleItems = customData;
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
    // >>> планируем нативные уведомления на 30 дней
    if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications();
    renderSyncFreshness();
    syncSemesterData(group, subgroup);
}

async function syncSemesterData(group, subgroup) {
    try {
        let newData = applyTimeFix(await apiSyncSchedule(group, subgroup));

        if (!Array.isArray(newData) || newData.length === 0) {
            if (typeof renderSyncFreshness === 'function') renderSyncFreshness();
            return;
        }

        if (cachedSchedule && cachedSchedule.length > 0
            && newData.length < cachedSchedule.length * 0.9) {
            console.error("Критический сбой СевГУ: попытка затереть расписание.");
            return;
        }

        if (typeof saveSyncTime === 'function') {
            saveSyncTime(group, subgroup);
        }

        if (isScheduleDifferent(newData, cachedSchedule)) {
            cachedSchedule = newData;
            renderCalendar();
            try { renderCharts(); } catch (e) { console.error(e); }
            updateScheduleStatus();
            refreshNotifications();
            // >>> расписание реально изменилось — пересобираем уведомления
            if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications();
            showUpdateNotification("Ваше расписание обновлено в фоне");
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
