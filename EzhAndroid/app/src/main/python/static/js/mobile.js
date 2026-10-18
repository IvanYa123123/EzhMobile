(function () {
    "use strict";
    var BREAKPOINT = 992;
    var STORAGE_KEY = "ezhMobileTab";
    var SWIPE_THRESHOLD = 80;

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
        
        // Специфичная логика для вкладки "День"
        if (tab === 'day') {
            if (!expandedDayDateStr) {
                // Если день не выбран, открываем понедельник текущей недели или сегодня
                const today = new Date();
                const isCurrentWeek = getLocalDateStr(currentBaseDate) === getLocalDateStr(new Date(today.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1))));
                expandedDayDateStr = isCurrentWeek ? getLocalDateStr(new Date()) : getLocalDateStr(currentBaseDate);
            }
            if (typeof renderDayView === 'function') renderDayView();
        }
        
        if (isMobile()) window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.switchMobileTab = switchTab;

    window.openDayMode = function(dateStr) {
        expandedDayDateStr = dateStr;
        switchTab('day');
    };

    function checkOnboarding() {
        if (!isMobile()) return;
        var savedGroup = localStorage.getItem('savedGroup');
        var bigHeader = document.getElementById('onboardingHeader');
        var compactHeader = document.getElementById('compactHeader');
        var compactGroup = document.getElementById('compactGroupName');

        if (savedGroup) {
            if (bigHeader) bigHeader.style.display = 'none';
            if (compactHeader) { compactHeader.classList.remove('d-none'); compactGroup.textContent = savedGroup; }
        } else {
            if (bigHeader) bigHeader.style.display = 'block';
            if (compactHeader) compactHeader.classList.add('d-none');
        }
    }

    window.showGroupChange = function() {
        document.getElementById('onboardingHeader').style.display = 'block';
        document.getElementById('compactHeader').classList.add('d-none');
        switchTab('schedule');
    };

    // ОБРАБОТКА КНОПКИ "НАЗАД" (Android Back)
    window.ezhOnBackPressed = function() {
        const modals = document.querySelectorAll('.modal.show');
        if (modals.length > 0) {
            modals.forEach(m => { const inst = bootstrap.Modal.getInstance(m); if (inst) inst.hide(); });
            return true;
        }
        const currentTab = document.body.getAttribute('data-mobile-tab');
        if (currentTab && currentTab !== 'schedule') {
            switchTab('schedule');
            return true;
        }
        const bigHeader = document.getElementById('onboardingHeader');
        if (bigHeader && bigHeader.style.display === 'none') {
            showGroupChange();
            return true;
        }
        return false;
    };

    function initSwipe() {
        var cal = document.getElementById("calendar");
        if (!cal || cal.dataset.swipeInit === "1") return;
        cal.dataset.swipeInit = "1";
        var startX = 0, startY = 0, tracking = false;

        cal.addEventListener("touchstart", function (e) {
            if (e.touches.length !== 1) { tracking = false; return; }
            startX = e.touches[0].clientX; startY = e.touches[0].clientY; tracking = true;
        }, { passive: true });

        cal.addEventListener("touchend", function (e) {
            if (!tracking) return;
            tracking = false;
            var touch = e.changedTouches[0], dx = touch.clientX - startX, dy = touch.clientY - startY;
            if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.8) {
                if (dx > 0) { if (typeof navigatePrev === "function") navigatePrev(); }
                else { if (typeof navigateNext === "function") navigateNext(); }
            }
        }, { passive: true });
    }

    function init() {
        if (!isMobile()) return;
        var saved = "schedule";
        try { saved = localStorage.getItem(STORAGE_KEY) || "schedule"; } catch (e) {}
        updateNavActive(saved);
        document.body.setAttribute("data-mobile-tab", saved);
        if (saved === 'day' && typeof renderDayView === 'function') renderDayView();
        checkOnboarding();
        initSwipe();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
    window.addEventListener("resize", initSwipe);
})();
