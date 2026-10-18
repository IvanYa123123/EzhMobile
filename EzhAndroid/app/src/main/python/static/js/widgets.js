// Общие функции виджетов: кэш лаб, отрисовка графиков, тема графиков.
// showStats / showLabs / renderLabsContent / saveAllLabs / renderLabPacing —
// в widgets-stats.js и widgets-labs.js.
// Лаб-айтемы — в lab-items.js.

async function updateLabsCache() {
    const group = document.getElementById("groupSelect").value.trim();
    if (!group) return;
    try { cachedLabs = await apiLoadLabs(group); }
    catch (e) { cachedLabs = {}; }
}

function _setCanvasInitialSize(canvasEl) {
    if (!canvasEl) return;
    const parent = canvasEl.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w > 0 && h > 0) {
        canvasEl.width = w;
        canvasEl.height = h;
        canvasEl.style.width = w + 'px';
        canvasEl.style.height = h + 'px';
    }
}

function renderCharts() {
    if (typeof Chart === 'undefined') return;
    const cPassed = getThemeColor('--chart-passed', '#6366f1');
    const cRemaining = getThemeColor('--chart-remaining', '#cbd5e1');
    const cLabDone = getThemeColor('--chart-lab-done', '#14b8a6');
    const cLabLeft = getThemeColor('--chart-lab-left', '#f59e0b');
    const cText = getThemeColor('--text-secondary', '#64748b');
    const cTooltipBg = getThemeColor('--chart-tooltip-bg', 'rgba(15, 23, 42, 0.92)');
    const cTooltipTx = getThemeColor('--chart-tooltip-text', '#f8fafc');
    const cBorder = getThemeColor('--border-color', '#e2e8f0');
    const tooltipOpts = {
        backgroundColor: cTooltipBg,
        titleColor: cTooltipTx,
        bodyColor: cTooltipTx,
        borderColor: cBorder,
        borderWidth: 1,
        padding: 8,
        cornerRadius: 6,
        displayColors: false
    };

    let passed = 0, remaining = 0;
    let todayStr = getLocalDateStr(new Date());
    cachedSchedule.forEach(item => { item.date < todayStr ? passed++ : remaining++; });

    const canvas1 = document.getElementById('globalStatsChart');
    if (canvas1) {
        if (globalChart) {
            globalChart.data.datasets[0].data = [passed, remaining];
            globalChart.data.datasets[0].backgroundColor = [cPassed, cRemaining];
            globalChart.options.plugins.legend.labels.color = cText;
            globalChart.options.plugins.tooltip = Object.assign({}, globalChart.options.plugins.tooltip, tooltipOpts);
            globalChart.update('none');
        } else {
            _setCanvasInitialSize(canvas1);
            globalChart = new Chart(canvas1.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Прошло', 'Осталось'],
                    datasets: [{ data: [passed, remaining], backgroundColor: [cPassed, cRemaining], borderWidth: 0 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 250 },
                    plugins: {
                        legend: { position: 'bottom', labels: { color: cText } },
                        tooltip: tooltipOpts
                    }
                }
            });
        }
    }

    let labItems = cachedSchedule.filter(item => item.type_name === 'ЛЗ' || item.type_name === 'ПЗ');
    let validSubjects = new Set(labItems.map(item => `${item.lesson} (${item.type_name})`));
    let totLabs = 0, compLabs = 0;
    for (let subj in cachedLabs) {
        if (!validSubjects.has(subj)) continue;
        totLabs += cachedLabs[subj].total;
        compLabs += cachedLabs[subj].completed;
    }
    let uncompLabs = Math.max(0, totLabs - compLabs);
    let labData = totLabs === 0 ? [0, 1] : [compLabs, uncompLabs];
    let labColors = totLabs === 0 ? [cRemaining, cRemaining] : [cLabDone, cLabLeft];
    let labLabels = totLabs === 0 ? ['Нет данных', ''] : ['Сдано', 'Осталось'];

    const canvas2 = document.getElementById('labStatsChart');
    if (canvas2) {
        if (globalLabChart) {
            globalLabChart.data.datasets[0].data = labData;
            globalLabChart.data.datasets[0].backgroundColor = labColors;
            globalLabChart.data.labels = labLabels;
            globalLabChart.options.plugins.legend.labels.color = cText;
            globalLabChart.options.plugins.tooltip = Object.assign({}, globalLabChart.options.plugins.tooltip, tooltipOpts);
            globalLabChart.update('none');
        } else {
            _setCanvasInitialSize(canvas2);
            globalLabChart = new Chart(canvas2.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: labLabels,
                    datasets: [{ data: labData, backgroundColor: labColors, borderWidth: 0 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 250 },
                    plugins: {
                        legend: { position: 'bottom', labels: { color: cText } },
                        tooltip: tooltipOpts
                    }
                }
            });
        }
    }

    if (typeof _renderGlobalStatsDetails === 'function') _renderGlobalStatsDetails();
    if (typeof _renderLabStatsDetails === 'function') _renderLabStatsDetails();
    if (typeof renderLabPacing === 'function') renderLabPacing();
}

function refreshChartsTheme() {
    if (typeof globalChart !== 'undefined' && globalChart) {
        try { globalChart.destroy(); } catch (e) {}
        globalChart = null;
    }
    if (typeof globalLabChart !== 'undefined' && globalLabChart) {
        try { globalLabChart.destroy(); } catch (e) {}
        globalLabChart = null;
    }
    if (typeof cachedSchedule !== 'undefined' && Array.isArray(cachedSchedule) && cachedSchedule.length > 0) {
        try { renderCharts(); } catch (e) {}
    }
}
