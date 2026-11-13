// Навигация по календарю: поиск даты и переходы из мини-календаря.
// Недели листаются свайпами (mobile.js), стрелки из вёрстки удалены.

function jumpToDate(dateStr) {
    let [y, m, d] = dateStr.split('-').map(Number);
    let target = new Date(y, m - 1, d);
    let dow = target.getDay();
    if (dow === 0) dow = 7;
    let monday = new Date(target);
    monday.setDate(monday.getDate() - (dow - 1));

    currentBaseDate = monday;
    expandedDayDateStr = dateStr;
    renderCalendar();

    setTimeout(() => {
        let el = document.getElementById(`day-col-${dateStr}`);
        if (!el) return;
        let headerEl = document.querySelector('.controls-header');
        let offset = headerEl ? headerEl.offsetHeight + 20 : 90;
        let top = window.pageYOffset + el.getBoundingClientRect().top - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 80);
}
