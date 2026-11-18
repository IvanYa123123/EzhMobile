// Мини-календарь в сайдбаре.
// Месяц всегда синхронизирован с текущей неделей основной сетки.
// Кнопки ‹ ● › листают основную сетку (на ±4 недели / к сегодня).

const MINI_CAL_WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MINI_CAL_MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

function renderMiniCalendar() {
    const container = document.getElementById('miniCalendarBody');
    if (!container) return;

    // Месяц = месяц понедельника текущей недели
    const base = new Date(currentBaseDate);
    const year  = base.getFullYear();
    const month = base.getMonth();

    const titleEl = document.getElementById('miniCalendarTitle');
    if (titleEl) titleEl.textContent = `${MINI_CAL_MONTHS[month]} ${year}`;

    // Точки под датой = сколько в этот день пар (для заметок и событий
    // отдельных индикаторов больше нет — пользователь просил именно пары).
    const pairsByDate = new Map();
    if (Array.isArray(cachedSchedule)) {
        cachedSchedule.forEach(item => {
            if (!item.date) return;
            pairsByDate.set(item.date, (pairsByDate.get(item.date) || 0) + 1);
        });
    }

    const firstDay = new Date(year, month, 1);
    let firstDow = firstDay.getDay();
    if (firstDow === 0) firstDow = 7;
    firstDow -= 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = getLocalDateStr(new Date());

    const currentWeekStart = new Date(currentBaseDate);
    currentWeekStart.setHours(0, 0, 0, 0);
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);

    let html = '<div class="mini-cal-grid">';
    MINI_CAL_WEEKDAYS.forEach(w => {
        html += `<div class="mini-cal-weekday">${w}</div>`;
    });

    for (let i = 0; i < firstDow; i++) {
        html += '<div class="mini-cal-day mini-cal-empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = getLocalDateStr(date);

        const classes = ['mini-cal-day'];
        if (dateStr === todayStr) classes.push('mini-cal-today');
        if (date >= currentWeekStart && date <= currentWeekEnd) classes.push('mini-cal-current-week');

        let customPairsCount = 0;
        if (typeof getCustomItemsForDate === 'function') {
            try {
                customPairsCount = getCustomItemsForDate(dateStr).filter(x => !x.is_event).length;
            } catch (e) { /* ignore */ }
        }
        const pairCount = (pairsByDate.get(dateStr) || 0) + customPairsCount;
        let dots = '';
        const dotCount = Math.min(pairCount, 8);
        for (let k = 0; k < dotCount; k++) dots += '<span class="mini-cal-dot"></span>';
        const dotsTitle = pairCount > 0
            ? ` title="${pairCount} ${plural(pairCount, 'пара', 'пары', 'пар')}"` : '';

        html += `<div class="${classes.join(' ')}" onclick="miniCalPickDate('${dateStr}')" title="${dateStr}">
            <span class="mini-cal-num">${d}</span>
            <span class="mini-cal-dots"${dotsTitle}>${dots}</span>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

// Кнопки мини-календаря листают основную сетку.
function miniCalPrevMonth() { changeWeek(-4); }
function miniCalNextMonth() { changeWeek(4);  }
function miniCalToday()     { goToToday();    }

function miniCalPickDate(dateStr) {
    // Открываем расписание именно на этой неделе и подсвечиваем день.
    const parts = dateStr.split('-').map(Number);
    const target = new Date(parts[0], parts[1] - 1, parts[2]);
    const dow = target.getDay() === 0 ? 7 : target.getDay();
    const monday = new Date(target);
    monday.setDate(monday.getDate() - (dow - 1));
    currentBaseDate = monday;
    window._calDir = null;
    if (typeof renderCalendar === 'function') renderCalendar();
    if (window.innerWidth < 992 && typeof switchMobileTab === 'function') {
        switchMobileTab('schedule');
    }
    setTimeout(function () {
        const details = document.getElementById('schedule-details-' + dateStr);
        const arrow = document.getElementById('arrow-' + dateStr);
        if (details && !details.classList.contains('expanded')) {
            details.classList.add('expanded');
            if (arrow) arrow.textContent = '▲';
        }
        const col = document.getElementById('day-col-' + dateStr);
        if (col) {
            col.classList.add('day-flash');
            setTimeout(function () { col.classList.remove('day-flash'); }, 1600);
            if (typeof col.scrollIntoView === 'function') col.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 50);
}

function refreshMiniCalendar() {
    renderMiniCalendar();
}