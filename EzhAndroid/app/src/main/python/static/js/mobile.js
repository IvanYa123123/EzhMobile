(function () {
    "use strict";

    var BREAKPOINT = 992;
    var STORAGE_KEY = "ezhMobileTab";
    var SWIPE_THRESHOLD = 80;

    function isMobile() {
        return window.innerWidth < BREAKPOINT;
    }

    function updateNavActive(tab) {
        var items = document.querySelectorAll(".mobile-nav-item");
        for (var i = 0; i < items.length; i++) {
            var el = items[i];
            if (el.getAttribute("data-tab") === tab) {
                el.classList.add("active");
            } else {
                el.classList.remove("active");
            }
        }
    }

    function switchTab(tab) {
        if (tab !== "schedule" && tab !== "people" && tab !== "widgets") {
            tab = "schedule";
        }
        if (tab === "people") {
            var friendsOn = typeof showFriendsSection === "undefined" || showFriendsSection;
            var teachersOn = typeof showTeachersSection === "undefined" || showTeachersSection;
            if (!friendsOn && !teachersOn) {
                tab = "schedule";
            }
        }
        document.body.setAttribute("data-mobile-tab", tab);
        try { localStorage.setItem(STORAGE_KEY, tab); } catch (e) {}
        updateNavActive(tab);
        if (isMobile()) {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }

    window.switchMobileTab = switchTab;

    function initSwipe() {
        var cal = document.getElementById("calendar");
        if (!cal || cal.dataset.swipeInit === "1") return;
        cal.dataset.swipeInit = "1";

        var startX = 0, startY = 0, tracking = false;

        cal.addEventListener("touchstart", function (e) {
            if (e.touches.length !== 1) { tracking = false; return; }
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            tracking = true;
        }, { passive: true });

        cal.addEventListener("touchend", function (e) {
            if (!tracking) return;
            tracking = false;
            var touch = e.changedTouches[0];
            var dx = touch.clientX - startX;
            var dy = touch.clientY - startY;
            if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.8) {
                if (dx > 0) {
                    if (typeof navigatePrev === "function") navigatePrev();
                } else {
                    if (typeof navigateNext === "function") navigateNext();
                }
            }
        }, { passive: true });
    }

    function preventDoubleTapZoom() {
        var lastTouch = 0;
        document.addEventListener("touchend", function (e) {
            var now = Date.now();
            if (now - lastTouch <= 300) { e.preventDefault(); }
            lastTouch = now;
        }, { passive: false });
    }

    function init() {
        if (!isMobile()) return;
        var saved = "schedule";
        try { saved = localStorage.getItem(STORAGE_KEY) || "schedule"; } catch (e) {}
        updateNavActive(saved);
        document.body.setAttribute("data-mobile-tab", saved);
        initSwipe();
        preventDoubleTapZoom();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    var resizeTimer = null;
    window.addEventListener("resize", function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(initSwipe, 150);
    });
})();
