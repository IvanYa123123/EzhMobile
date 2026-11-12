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
