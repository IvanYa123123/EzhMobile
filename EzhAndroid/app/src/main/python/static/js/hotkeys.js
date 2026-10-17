// Горячие клавиши:
//   Ctrl/⌘ + K — открыть глобальный поиск
//   Ctrl/⌘ + N — создать заметку на сегодня
//   Esc        — свернуть развёрнутый день / отменить ввод заметки
//
// Обработчик висит на document в фазе bubbling. Если открыта
// Bootstrap-модалка — Esc отдаём ей (Bootstrap сам её закроет).
// В полях ввода не мешаем печатать.

(function () {

    function _isTypingContext(el) {
        if (!el) return false;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function _isModalOpen() {
        return document.querySelector('.modal.show') !== null;
    }

    function _isSearchModalOpen() {
        return document.querySelector('#searchModal.show') !== null;
    }

    document.addEventListener('keydown', (e) => {

        const key = (e.key || '').toLowerCase();

        // ─── Ctrl/⌘ + K: глобальный поиск ─────────────────────
        if (key === 'k' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
            // Если поиск уже открыт — просто фокусируем поле и выделяем
            if (_isSearchModalOpen()) {
                e.preventDefault();
                const inp = document.getElementById('searchInput');
                if (inp) { inp.focus(); inp.select(); }
                return;
            }
            // В обычных полях ввода не мешаем пользователю печатать
            if (_isTypingContext(e.target)) return;

            e.preventDefault();
            if (typeof openSearchModal === 'function') openSearchModal();
            return;
        }

        // ─── Ctrl/⌘ + N: заметка на сегодня ────────────────────
        if (key === 'n' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
            if (_isTypingContext(e.target)) return;
            e.preventDefault();
            _openTodayTaskInput();
            return;
        }

        // ─── Esc: свернуть день / отменить ввод заметки ────────
        if (key === 'escape') {

            // 1) Отмена ввода заметки: Esc внутри textarea заметки
            const t = e.target;
            if (t && t.id && t.id.indexOf('task-input-') === 0) {
                e.preventDefault();
                t.value = '';
                const wrap = document.getElementById(
                    'task-input-wrap-' + t.id.slice('task-input-'.length)
                );
                if (wrap) wrap.style.display = 'none';
                t.blur();
                return;
            }

            // 2) Bootstrap-модалки: не мешаем, они сами закроются по Esc
            if (_isModalOpen()) return;

            // 3) Развёрнутый день: сворачиваем
            if (typeof expandedDayDateStr !== 'undefined' && expandedDayDateStr) {
                e.preventDefault();
                if (typeof toggleExpandDay === 'function') {
                    toggleExpandDay(expandedDayDateStr);
                }
            }
        }
    });

    function _openTodayTaskInput() {
        const today = getLocalDateStr(new Date());
        const wrapId = 'task-input-wrap-' + today;

        // Если сегодняшний день не в текущей видимой неделе — прыгаем
        if (!document.getElementById(wrapId)) {
            if (typeof goToToday === 'function') {
                goToToday();
            } else if (typeof jumpToDate === 'function') {
                jumpToDate(today);
            }
        }

        // renderCalendar выполняется синхронно до первого await,
        // так что к следующему кадру DOM уже готов.
        requestAnimationFrame(() => {
            const wrap = document.getElementById(wrapId);
            if (!wrap) return;

            const input = document.getElementById('task-input-' + today);
            if (wrap.style.display === 'none' || wrap.style.display === '') {
                if (typeof toggleTaskInput === 'function') toggleTaskInput(today);
            }
            if (input) {
                input.focus();
                const len = input.value.length;
                try { input.setSelectionRange(len, len); } catch (err) {}
            }
        });
    }

})();