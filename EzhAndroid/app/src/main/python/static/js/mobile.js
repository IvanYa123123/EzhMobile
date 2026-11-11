(function () {
    "use strict";
    var BREAKPOINT = 992;
    var STORAGE_KEY = "ezhMobileTab";

    function isMobile() { return window.innerWidth < BREAKPOINT; }

    function updateNavActive(tab) {
        var items = document.querySelectorAll(".mobile-nav-item");
        for (var i = 0; i < items.length; i++) {
            if (items[i].getAttribute("data-tab") === tab) items[i].classList.add("active");
            else items[i].classList.remove("active");
        }
    }

    function switchTab(tab) {
        if (tab !== "schedule" && tab !== "day" && tab !== "people" && tab !== "widgets") tab = "schedule";
        document.body.setAttribute("data-mobile-tab", tab);
        try { localStorage.setItem(STORAGE_KEY, tab); } catch (e) {}
        updateNavActive(tab);

        // Уходя из «Дня», снимаем дневной режим: иначе стрелки
        // «Расписания» продолжают листать по одному дню.
        if (tab !== 'day' && window.expandedDayDateStr) {
            window.expandedDayDateStr = null;
            window._verticalDayOffset = 0;
            var fullCols = document.querySelectorAll('.day-col.fullscreen-day');
            for (var f = 0; f < fullCols.length; f++) fullCols[f].classList.remove('fullscreen-day');
            var calEl = document.getElementById('calendar');
            if (calEl) calEl.classList.remove('has-fullscreen');
            if (typeof renderCalendar === 'function' && document.getElementById('calendar')) renderCalendar();
        }

        if (tab === 'day') {
            if (!window.expandedDayDateStr) {
                const today = new Date();
                const monday = new Date(today);
                monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1));
                const isCurrentWeek = new Date(currentBaseDate).toDateString() === monday.toDateString();
                window.expandedDayDateStr = isCurrentWeek ? getLocalDateStr(today) : getLocalDateStr(currentBaseDate);
            }
            if (typeof renderDayView === 'function') renderDayView();
        }

        if (isMobile()) window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.switchMobileTab = switchTab;

    window.openDayMode = function(dateStr) {
        if (isMobile()) {
            window.expandedDayDateStr = dateStr;
            switchTab('day');
        } else {
            // toggleExpandDay сам решает, разворачивать или сворачивать —
            // проверяет наличие .fullscreen-day у колонки. Старая проверка
            // «expandedDayDateStr !== dateStr» ломала сворачивание повторным
            // кликом по развёрнутому дню.
            if (typeof toggleExpandDay === 'function') {
                toggleExpandDay(dateStr);
            }
        }
    };

    window.checkOnboarding = function() {
        if (!isMobile()) return;
        var savedGroup = localStorage.getItem('savedGroup');
        var bigHeader = document.getElementById('onboardingHeader');
        var compactHeader = document.getElementById('compactHeader');
        var compactGroup = document.getElementById('compactGroupName');

        if (bigHeader) bigHeader.classList.add('d-none');
        if (compactHeader) compactHeader.classList.remove('d-none');

        if (compactGroup) {
            if (savedGroup) {
                compactGroup.textContent = savedGroup;
                compactGroup.classList.remove('text-danger');
            } else {
                compactGroup.textContent = 'Выбрать группу';
                compactGroup.classList.add('text-danger');
            }
        }
    };

    window.showGroupChange = function() {
        if (typeof openGroupSelectModal === 'function') {
            openGroupSelectModal(false);
        }
    };

    window.ezhOnBackPressed = function() {
        const modals = document.querySelectorAll('.modal.show');
        if (modals.length > 0) {
            modals.forEach(m => {
                const inst = bootstrap.Modal.getInstance(m);
                if (inst) inst.hide();
            });
            return true;
        }
        const currentTab = document.body.getAttribute('data-mobile-tab');
        if (currentTab && currentTab !== 'schedule') {
            switchTab('schedule');
            return true;
        }
        return false;
    };

    function init() {
        if (!isMobile()) return;
        var saved = "schedule";
        try { saved = localStorage.getItem(STORAGE_KEY) || "schedule"; } catch (e) {}
        updateNavActive(saved);
        document.body.setAttribute("data-mobile-tab", saved);
        if (saved === 'day' && typeof renderDayView === 'function') renderDayView();
        if (typeof checkOnboarding === 'function') checkOnboarding();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
