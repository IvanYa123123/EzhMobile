// Принудительное обновление расписания с сервера СевГУ.

let _refreshInFlight = false;

async function manualRefresh() {
    if (_refreshInFlight) return;

    const group    = (document.getElementById('groupSelect').value || '').trim();
    const subgroup = document.getElementById('subgroupSelect').value;

    if (!group) {
        alert('Сначала выберите группу');
        return;
    }

    // В разметке у обеих кнопок (мобильная + десктопная) нет стабильных id —
    // находим их по onclick и блокируем все сразу. Иконку не крутим —
    // спиннер живёт в лоадере.
    const refreshButtons = Array.from(
        document.querySelectorAll('button[onclick*="manualRefresh"]')
    );

    console.log('[refresh] START group=%s subgroup=%s', group, subgroup);

    _refreshInFlight = true;
    showGlobalLoader(`🔄 Обновляем «${group}» с СевГУ...`);
    refreshButtons.forEach(b => { b.disabled = true; });

    try {
        // --- 1. Форсим sync с сервера ---
        setLoaderText('📡 Запрашиваем расписание (может занять 5–15 сек)...');
        const syncResult = await apiSyncScheduleForce(group, subgroup);
        const fresh = syncResult.items;
        const exhausted = !!syncResult.exhausted;

        if (Array.isArray(fresh) && fresh.length > 0) {
            cachedSchedule = applyTimeFix(fresh);
            // Частичную загрузку не записываем в sync-время (п.11 §11).
            if (!exhausted && typeof saveSyncTime === 'function') saveSyncTime(group, subgroup);
        } else {
            setLoaderText('📦 Загружаем из локального кэша...');
            const fallback = await apiLoadSchedule(group, subgroup);
            cachedSchedule = applyTimeFix(fallback);
        }

        // --- 2. Кастомное расписание + настройки предметов ---
        setLoaderText('📚 Подтягиваем события и настройки предметов...');
        const [cs, subjects] = await Promise.all([
            apiLoadCustomSchedule(group).catch(() => []),
            apiLoadSubjects().catch(() => ({}))
        ]);
        customScheduleItems   = cs;
        cachedSubjectSettings = subjects;

        // --- 3. Лабы + даты заметок ---
        setLoaderText('📊 Пересчитываем статистику...');
        await updateLabsCache();
        await refreshTaskDates();

        // --- 4. Друзья в фоне ---
        if (typeof syncFriendsSchedules === 'function') {
            syncFriendsSchedules(true).catch(e => console.error('[refresh] friends sync failed', e));
        }

        // --- 5. Перерисовка ---
        setLoaderText('🎨 Рисуем календарь...');
        renderCalendar();
        try { renderCharts(); } catch (e) { console.error('[refresh] renderCharts failed', e); }
        updateScheduleStatus();
        refreshNotifications();
        if (typeof scheduleAllNotifications === 'function') scheduleAllNotifications();
        if (typeof renderSyncFreshness === 'function') renderSyncFreshness();

        const count = Array.isArray(cachedSchedule) ? cachedSchedule.length : 0;
        showUpdateNotification(exhausted
            ? `⚠️ Расписание загружено частично (${count} пар) — попробуйте обновить ещё раз`
            : `✅ Расписание обновлено (${count} пар)`);

    } catch (e) {
        console.error('[refresh] ERROR:', e);
        let msg = '❌ Не удалось обновить расписание';

        const statusFromMsg = (() => {
            const m = /HTTP (\d+)/.exec(e && e.message ? e.message : '');
            return m ? parseInt(m[1], 10) : null;
        })();
        const status = (e && e.status) || statusFromMsg;

        if (status === 429) {
            msg = '⏳ Слишком часто. Подождите немного и попробуйте снова';
        } else if (status === 500) {
            msg = '❌ Сервер не справился с запросом (ошибка 500)';
        } else if (status === 502 || status === 503 || status === 504) {
            msg = '🌐 Сервер СевГУ недоступен. Попробуйте позже';
        } else if (status) {
            msg = `❌ Ошибка HTTP ${status}`;
        } else if (e && e.message) {
            msg = `❌ ${e.message}`;
        }
        showUpdateNotification(msg);

    } finally {
        hideGlobalLoader();
        refreshButtons.forEach(b => { b.disabled = false; });
        _refreshInFlight = false;
    }
}
