// T9-автокомплит для полей ввода групп.
//
// Поведение:
//   • groupsLoaded === false и groupsLoadFailed === false → dropdown
//     показывает «⏳ Загрузка справочника…» + кнопку «Создать».
//   • groupsLoadFailed === true → «⚠️ Справочник недоступен» + кнопку
//     «Создать».
//   • groupsLoaded === true → обычный T9-поиск по allGroups.
//   • События ezh:groups-loaded / ezh:groups-load-failed перерисовывают
//     открытый dropdown (через main.js → ensureGroupsLoaded).
//   • Кнопка «➕ Создать группу «XYZ»» показывается при любом состоянии,
//     если введён непустой текст и точного совпадения нет.

const _AC_DEBOUNCE_MS = 80;

let _allGroupsLowerCache = null;

function _getAllGroupsLower() {
    if (!_allGroupsLowerCache || _allGroupsLowerCache.length !== allGroups.length) {
        _allGroupsLowerCache = allGroups.map(g => g.toLowerCase());
    }
    return _allGroupsLowerCache;
}

function initGroupAutocomplete(input) {
    if (!input) return;

    if (input.dataset.acInit === '1') {
        console.log('[ac] already initialized, skip:', input.id);
        return;
    }
    input.dataset.acInit = '1';

    console.log('[ac] init on', input.id || input.name);

    let dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-list';
    dropdown.dataset.acFor = input.id || '';
    document.body.appendChild(dropdown);

    let currentFocus = -1;
    let renderTimer = null;

    function positionDropdown() {
        let rect = input.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 2) + 'px';
        dropdown.style.width = Math.max(rect.width, 280) + 'px';
    }
    function hide() { dropdown.style.display = 'none'; currentFocus = -1; }
    function getItems() {
        return dropdown.querySelectorAll(
            '.autocomplete-item:not(.autocomplete-empty):not(.autocomplete-footer)'
        );
    }
    function updateActive() {
        let items = getItems();
        items.forEach((it, i) => it.classList.toggle('active', i === currentFocus));
        if (items[currentFocus]) items[currentFocus].scrollIntoView({ block: 'nearest' });
    }

    function _addButtonHtml(query) {
        return `
            <div class="autocomplete-item autocomplete-add" data-add="${escapeAttr(query)}">
                <div class="autocomplete-add-title">➕ Создать группу «${escapeHtml(query)}»</div>
                <div class="autocomplete-add-hint">Не найдена в справочнике — добавьте в свою базу</div>
            </div>`;
    }

    function render() {
        const query = input.value.trim();
        const lower = query.toLowerCase();
        const isLoading = (typeof groupsLoaded !== 'undefined') && !groupsLoaded
            && (typeof groupsLoadFailed === 'undefined' || !groupsLoadFailed);
        const failed = (typeof groupsLoadFailed !== 'undefined') && groupsLoadFailed;

        console.log('[ac] render', {
            input: input.id,
            query: query,
            groupsCount: allGroups.length,
            loaded: (typeof groupsLoaded !== 'undefined') ? groupsLoaded : 'undefined',
            failed: failed,
            isLoading: isLoading
        });

        let html = '';

        // ── 1. Состояние: справочник недоступен ──────────────
        if (failed && allGroups.length === 0) {
            html += '<div class="autocomplete-item autocomplete-empty">⚠️ Справочник недоступен</div>';
            if (query) html += _addButtonHtml(query);
            dropdown.innerHTML = html;
            positionDropdown();
            dropdown.style.display = 'block';
            currentFocus = -1;
            return;
        }

        // ── 2. Состояние: загрузка ──────────────────────────
        if (isLoading && allGroups.length === 0) {
            html += '<div class="autocomplete-item autocomplete-empty">⏳ Загрузка справочника…</div>';
            if (query) html += _addButtonHtml(query);
            dropdown.innerHTML = html;
            positionDropdown();
            dropdown.style.display = 'block';
            currentFocus = -1;
            return;
        }

        // ── 3. Обычный поиск ────────────────────────────────
        let matches = [];
        if (!lower) {
            matches = allGroups.slice(0, 40);
        } else {
            const lowerAll = _getAllGroupsLower();
            let starts = [], contains = [];
            for (let i = 0; i < allGroups.length; i++) {
                const gl = lowerAll[i];
                if (gl.startsWith(lower)) starts.push(allGroups[i]);
                else if (gl.includes(lower)) contains.push(allGroups[i]);
            }
            matches = starts.concat(contains).slice(0, 50);
        }
        const exact = lower && _getAllGroupsLower().indexOf(lower) !== -1;

        if (matches.length === 0 && !query) {
            html += '<div class="autocomplete-item autocomplete-empty">Справочник групп пуст</div>';
        } else if (matches.length === 0) {
            html += '<div class="autocomplete-item autocomplete-empty">В справочнике ничего не найдено</div>';
        } else {
            matches.forEach(g => {
                html += `<div class="autocomplete-item" data-value="${escapeAttr(g)}">${highlightMatch(g, query)}</div>`;
            });
        }

        if (query && !exact) html += _addButtonHtml(query);

        if (allGroups.length > 0) {
            html += `<div class="autocomplete-footer">Всего групп в справочнике: ${allGroups.length}</div>`;
        }

        dropdown.innerHTML = html;
        positionDropdown();
        dropdown.style.display = 'block';
        currentFocus = -1;
    }

    function renderDebounced() {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(render, _AC_DEBOUNCE_MS);
    }

    input.addEventListener('focus', render);
    input.addEventListener('input', renderDebounced);
    input.addEventListener('blur', () => setTimeout(hide, 180));

    input.addEventListener('keydown', (e) => {
        let items = getItems();
        if (dropdown.style.display !== 'block') {
            if (e.key === 'ArrowDown') { render(); e.preventDefault(); }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentFocus = (currentFocus + 1) % Math.max(items.length, 1);
            updateActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentFocus = (currentFocus - 1 + items.length) % Math.max(items.length, 1);
            updateActive();
        } else if (e.key === 'Enter') {
            if (currentFocus > -1 && items[currentFocus]) {
                e.preventDefault();
                e.stopPropagation();
                items[currentFocus].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            } else if (items.length > 0 && input.value.trim()) {
                const exact = _getAllGroupsLower().indexOf(input.value.trim().toLowerCase()) !== -1;
                if (exact) hide();
            }
        } else if (e.key === 'Escape') {
            hide();
        }
    });

    dropdown.addEventListener('mousedown', async (e) => {
        let item = e.target.closest('.autocomplete-item');
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();

        if (item.dataset.value) {
            input.value = item.dataset.value;
            hide();
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }

        if (item.dataset.add) {
            const name = item.dataset.add.trim();
            if (!name) return;
            console.log('[ac] creating custom group:', name);
            try {
                const data = await apiAddCustomGroup(name);
                if (data && data.success) {
                    if (!validGroups.has(name.toUpperCase())) {
                        validGroups.add(name.toUpperCase());
                        allGroups.push(name);
                    }
                    input.value = name;
                    hide();
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof showUpdateNotification === 'function') {
                        showUpdateNotification(`✅ Группа «${name}» добавлена`);
                    }
                } else if (data && data.error) {
                    if (typeof showUpdateNotification === 'function') {
                        showUpdateNotification(`❌ ${data.error}`);
                    }
                }
            } catch (err) {
                console.error('[ac] add custom group failed:', err);
                if (typeof showUpdateNotification === 'function') {
                    showUpdateNotification('❌ Не удалось добавить группу (проверьте формат)');
                }
            }
        }
    });

    // Перерисовка по событиям загрузки справочника.
    document.addEventListener('ezh:groups-loaded', () => {
        if (dropdown.style.display === 'block') render();
    });
    document.addEventListener('ezh:groups-load-failed', () => {
        if (dropdown.style.display === 'block') render();
    });

    window.addEventListener('scroll', () => {
        if (dropdown.style.display === 'block') positionDropdown();
    }, true);
    window.addEventListener('resize', () => {
        if (dropdown.style.display === 'block') positionDropdown();
    });
}
