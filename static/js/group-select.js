// Модалка выбора группы.

let _groupSelectModalInstance = null;

function openGroupSelectModal(forced = false) {
    console.log("[group-select] Пытаемся открыть модалку выбора группы...");
    const modalEl = document.getElementById('groupSelectModal');
    if (!modalEl) { console.warn('[group-select] ОШИБКА: #groupSelectModal не найдена в HTML!'); return; }
    if (typeof bootstrap === 'undefined') { console.warn('[group-select] ОШИБКА: bootstrap не загружен!'); return; }

    const input = document.getElementById('gsGroupInput');
    const select = document.getElementById('gsSubgroupSelect');
    const title = document.getElementById('gsModalTitle');
    const hint = document.getElementById('gsHint');
    const cancelBtn = document.getElementById('gsCancelBtn');

    if (title) title.textContent = forced ? 'Выберите группу' : 'Сменить группу';
    if (cancelBtn) cancelBtn.style.display = forced ? 'none' : '';

    const savedGroup = localStorage.getItem('savedGroup') || '';
    const savedSub = localStorage.getItem('savedSubgroup') || '0';
    if (input) input.value = savedGroup;
    if (select) select.value = savedSub;

    if (hint) {
        hint.textContent = 'Начните вводить номер группы — например, ИВТ/б-24-1-о.';
        hint.className = 'small text-muted mb-2';
    }

    if (!modalEl.dataset.focusHooked) {
        modalEl.addEventListener('shown.bs.modal', () => {
            const inp = document.getElementById('gsGroupInput');
            if (inp) { inp.focus(); inp.select(); }
        });
        modalEl.dataset.focusHooked = '1';
    }

    _groupSelectModalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    _groupSelectModalInstance.show();
    console.log("[group-select] Модалка открыта.");
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

    const savedGroup = localStorage.getItem('savedGroup') || '';
    if (savedGroup !== group) {
        document.getElementById('groupSelect').value = savedGroup;
        document.getElementById('subgroupSelect').value = localStorage.getItem('savedSubgroup') || '0';
        updateGroupDisplay();
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
            display.title = 'Изменить группу';
        } else {
            display.textContent = 'Группа не выбрана';
            display.classList.add('group-display-empty');
            display.title = 'Выбрать группу';
        }
    }

    const compactName = document.getElementById('compactGroupName');
    if (compactName) {
        compactName.textContent = group || 'Группа';
    }
}
