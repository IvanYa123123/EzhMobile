// Первичная инициализация темы до отрисовки страницы.
// Раньше это был inline-скрипт с nonce; теперь отдельный файл,
// чтобы index.html был полностью статическим и мог отдаваться
// через WebViewAssetLoader.

(function () {
    try {
        var t = localStorage.getItem('theme') || 'light';
        // «Своя тема» удалена из интерфейса: сохранённое значение сбрасываем.
        if (t === 'custom') {
            t = 'light';
            localStorage.setItem('theme', 'light');
        }
        document.documentElement.setAttribute('data-theme', t);
        document.documentElement.setAttribute('data-bs-theme', t === 'dark' ? 'dark' : 'light');
    } catch (e) {}
})();
