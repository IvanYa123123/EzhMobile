// Первичная инициализация темы до отрисовки страницы.
// Раньше это был inline-скрипт с nonce; теперь отдельный файл,
// чтобы index.html был полностью статическим и мог отдаваться
// через WebViewAssetLoader.

(function () {
    try {
        var t = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', t);
        document.documentElement.setAttribute('data-bs-theme', t === 'dark' ? 'dark' : 'light');
        if (t === 'custom') {
            var raw = localStorage.getItem('customTheme');
            if (raw) {
                var d = JSON.parse(raw);
                if (d && d.colors) {
                    for (var k in d.colors) {
                        document.documentElement.style.setProperty(k, d.colors[k]);
                    }
                }
            }
        }
    } catch (e) {}
})();
