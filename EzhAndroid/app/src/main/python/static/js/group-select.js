// Динамическая модалка выбора группы.

let _groupSelectModalInstance = null;
let _gsFocusBound = false;

function _gsBindFocusOnShow(modalEl) {
    if (_gsFocusBound) return;
    _gsFocusBound = true;
    modalEl.addEventListener('shown.bs.modal', () => {
        const inp = document.getElementById('gsGroupInput');
        if (inp) setTimeout(() => { inp.focus(); }, 60);
    });
}

function openGroupSelectModal(forced = false) {
    try {
        console.log('[group-select] open, forced =', forced);
        if (typeof bootstrap === 'undefined') {
            alert('❌ Критическая ошибка: Bootstrap не загружен!');
            return;
        }

        let modalEl = document.getElementById('groupSelectModal');

        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.className = 'modal fade';
            modalEl.id = 'groupSelectModal';
            modalEl.tabIndex = -1;
            modalEl.innerHTML = `
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow">
                        <div class="modal-header py-3 border-bottom-0">
                            <h5 class="modal-title fw-bold mb-0" id="gsModalTitle">Выберите группу</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label small fw-bold">Группа</label>
                                <input type="text" id="gsGroupInput" class="form-control" placeholder="Например, ИВТ/б-24-1-о" autocomplete="off">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">Подгруппа</label>
                                <select id="gsSubgroupSelect" class="form-select">
                                    <option value="0">Все подгруппы</option>
                                    <option value="1">1 подгруппа</option>
                                    <option value="2">2 подгруппа</option>
                                </select>
                            </div>
                            <div id="gsHint" class="small text-danger mb-2" style="display:none;"></div>
                        </div>
                        <div class="modal-footer border-0">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" id="gsCancelBtn">Отмена</button>
                            <button type="button" class="btn btn-primary fw-bold" id="gsSubmitBtn">Продолжить</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modalEl);
            document.getElementById('gsSubmitBtn').onclick = saveGroupFromModal;
        }

        // Всегда инициализируем — внутри защита input.dataset.acInit.
        const gsInput = document.getElementById('gsGroupInput');
        if (gsInput && typeof initGroupAutocomplete === 'function') {
            initGroupAutocomplete(gsInput);
        } else if (gsInput) {
            console.warn('[group-select] initGroupAutocomplete not available');
        }

        _gsBindFocusOnShow(modalEl);

        const title = document.getElementById('gsModalTitle');
        const cancelBtn = document.getElementById('gsCancelBtn');

        if (title) title.textContent = forced ? 'Выберите группу' : 'Сменить группу';
        if (cancelBtn) cancelBtn.style.display = forced ? 'none' : '';

        const savedGroup = localStorage.getItem('savedGroup') || '';
        const savedSub = localStorage.getItem('savedSubgroup') || '0';
        if (gsInput) gsInput.value = savedGroup;
        const subSel = document.getElementById('gsSubgroupSelect');
        if (subSel) subSel.value = savedSub;

        _groupSelectModalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        _groupSelectModalInstance.show();

    } catch (e) {
        console.error('[group-select] open failed:', e);
        alert('❌ Ошибка при открытии модалки:\n' + (e && e.message ? e.message : e));
    }
}

async function saveGroupFromModal() {
    const input = document.getElementById('gsGroupInput');
    const select = document.getElementById('gsSubgroupSelect');
    const hint = document.getElementById('gsHint');
    if (!input || !select) return;

    const group = (input.value || '').trim();
    const subgroup = select.value || '0';

    if (!group) {
        if (hint) { hint.textContent = 'Введите название группы'; hint.style.display = 'block'; }
        input.focus();
        return;
    }

    if (typeof validGroups !== 'undefined' && validGroups.size > 0
            && !validGroups.has(group.toUpperCase())) {
        const ok = confirm(
            `Группы «${group}» нет в справочнике.\n\nПродолжить? Она будет добавлена в вашу базу.`
        );
        if (!ok) { input.focus(); return; }
        try {
            await apiAddCustomGroup(group);
            validGroups.add(group.toUpperCase());
            if (!allGroups.includes(group)) allGroups.push(group);
        } catch (e) {
            console.error('[group-select] add custom failed:', e);
            if (hint) {
                hint.textContent = 'Не удалось добавить группу. Проверьте формат (буквы, цифры, / . _ -).';
                hint.style.display = 'block';
            }
            return;
        }
    }

    document.getElementById('groupSelect').value = group;
    document.getElementById('subgroupSelect').value = subgroup;

    if (_groupSelectModalInstance) _groupSelectModalInstance.hide();

    updateGroupDisplay();

    if (typeof fetchSemesterData === 'function') {
        await fetchSemesterData();
    }

    if (typeof checkOnboarding === 'function') checkOnboarding();
}

function updateGroupDisplay() {
    const gsInput = document.getElementById('groupSelect');
    const ssInput = document.getElementById('subgroupSelect');
    const group = gsInput ? gsInput.value.trim() : '';
    const subgroup = ssInput ? ssInput.value : '0';

    const display = document.getElementById('groupDisplay');
    if (display) {
        if (group) {
            let label = group;
            if (subgroup !== '0') label += ` (${subgroup} подгр.)`;
            display.textContent = label;
            display.classList.remove('group-display-empty');
        } else {
            display.textContent = 'Группа не выбрана';
            display.classList.add('group-display-empty');
        }
    }

    const compactName = document.getElementById('compactGroupName');
    if (compactName) {
        compactName.textContent = group || 'Выбрать группу';
    }
}
