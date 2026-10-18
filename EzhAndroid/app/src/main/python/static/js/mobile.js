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

        if (tab === 'day') {
            if (!window.expandedDayDateStr) {
                const today = new Date();
                const isCurrentWeek = new Date(currentBaseDate).toDateString() ===
                    new Date(today.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1))).toDateString();
                window.expandedDayDateStr = isCurrentWeek ? getLocalDateStr(new Date()) : getLocalDateStr(currentBaseDate);
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
            // На десктопе разворачиваем день на всю ширину
            if (typeof toggleExpandDay === 'function' && window.expandedDayDateStr !== dateStr) {
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

        if (savedGroup) {
            if (bigHeader) bigHeader.style.display = 'none';
            if (compactHeader) {
                compactHeader.classList.remove('d-none');
                compactGroup.textContent = savedGroup;
            }
        } else {
            if (bigHeader) bigHeader.style.display = 'block';
            if (compactHeader) compactHeader.classList.add('d-none');
        }
    };

    window.showGroupChange = function() {
        document.getElementById('onboardingHeader').style.display = 'block';
        document.getElementById('compactHeader').classList.add('d-none');
        switchTab('schedule');
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
        const bigHeader = document.getElementById('onboardingHeader');
        if (bigHeader && bigHeader.style.display === 'none') {
            showGroupChange();
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
