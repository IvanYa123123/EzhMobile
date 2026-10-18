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
        if (tab !== "schedule" && tab !== "people" && tab !== "widgets") tab = "schedule";
        document.body.setAttribute("data-mobile-tab", tab);
        try { localStorage.setItem(STORAGE_KEY, tab); } catch (e) {}
        updateNavActive(tab);
        if (isMobile()) window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.switchMobileTab = switchTab;

    function checkOnboarding() {
        if (!isMobile()) return;
        var savedGroup = localStorage.getItem('savedGroup');
        var bigHeader = document.getElementById('onboardingHeader');
        var compactHeader = document.getElementById('compactHeader');
        var compactGroup = document.getElementById('compactGroupName');

        if (savedGroup) {
            if (bigHeader) bigHeader.style.display = 'none';
            if (compactHeader) {
                compactHeader.classList.remove('d-none');
                if (compactGroup) compactGroup.textContent = savedGroup;
            }
        } else {
            if (bigHeader) bigHeader.style.display = 'block';
            if (compactHeader) compactHeader.classList.add('d-none');
        }
    }

    window.showGroupChange = function() {
        var bigHeader = document.getElementById('onboardingHeader');
        var compactHeader = document.getElementById('compactHeader');
        if (bigHeader) bigHeader.style.display = 'block';
        if (compactHeader) compactHeader.classList.add('d-none');
    };

    // ОБРАБОТКА КНОПКИ "НАЗАД" (Android Back Button)
    window.ezhOnBackPressed = function() {
        // 1. Если открыта модалка (настройки, добавление друга и т.д.)
        const modals = document.querySelectorAll('.modal.show');
        if (modals.length > 0) {
            modals.forEach(m => {
                const modalInstance = bootstrap.Modal.getInstance(m);
                if (modalInstance) modalInstance.hide();
            });
            return true;
        }
        
        // 2. Если открыт развернутый день
        if (typeof expandedDayDateStr !== 'undefined' && expandedDayDateStr) {
            if (typeof toggleExpandDay === 'function') toggleExpandDay(expandedDayDateStr);
            return true;
        }

        // 3. Если мы не на главном экране (Расписание)
        const currentTab = document.body.getAttribute('data-mobile-tab');
        if (currentTab && currentTab !== 'schedule') {
            switchTab('schedule');
            return true;
        }

        // 4. Если скрыта большая шапка, показываем её (возврат к выбору группы)
        const bigHeader = document.getElementById('onboardingHeader');
        if (bigHeader && bigHeader.style.display === 'none') {
            showGroupChange();
            return true;
        }

        return false; // Если ничего не подошло, отдаем команду Android'у (закрыть приложение)
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
        checkOnboarding();
        initSwipe();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    window.addEventListener("resize", initSwipe);
})();
