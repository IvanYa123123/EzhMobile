// Динамическая модалка выбора группы.

let _groupSelectModalInstance = null;

function openGroupSelectModal(forced = false) {
    try {
        console.log("[group-select] Открытие модалки...");
        if (typeof bootstrap === 'undefined') {
            alert("❌ Критическая ошибка: Bootstrap не загружен!");
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
                            <div id="gsHint" class="small text-muted mb-2">Введите номер группы.</div>
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

            if (typeof initGroupAutocomplete === 'function') {
                initGroupAutocomplete(document.getElementById('gsGroupInput'));
            }
        }

        const title = document.getElementById('gsModalTitle');
        const cancelBtn = document.getElementById('gsCancelBtn');

        if (title) title.textContent = forced ? 'Выберите группу' : 'Сменить группу';
        if (cancelBtn) cancelBtn.style.display = forced ? 'none' : '';

        const savedGroup = localStorage.getItem('savedGroup') || '';
        const savedSub = localStorage.getItem('savedSubgroup') || '0';
        document.getElementById('gsGroupInput').value = savedGroup;
        document.getElementById('gsSubgroupSelect').value = savedSub;

        _groupSelectModalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        _groupSelectModalInstance.show();
        
    } catch (e) {
        alert("❌ ОШИБКА ПРИ ОТКРЫТИИ МОДАЛКИ:\n" + e.message);
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
        if (hint) { hint.textContent = 'Введите название группы'; hint.className = 'small text-danger mb-2'; }
        input.focus();
        return;
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
