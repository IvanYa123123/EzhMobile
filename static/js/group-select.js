// Модалка выбора группы. Открывается:
//   • автоматически на первом запуске (нет savedGroup);
//   • по клику на #groupDisplay (десктоп);
//   • по клику на карандаш в компактной шапке (мобилка);
//   • из #settingsModal (задел на будущее).
//
// После сохранения ставит группу в скрытые #groupSelect / #subgroupSelect,
// обновляет #groupDisplay и #compactGroupName, вызывает fetchSemesterData().

let _groupSelectModalInstance = null;

function openGroupSelectModal(forced = false) {
    const modalEl = document.getElementById('groupSelectModal');
    if (!modalEl) { console.warn('[group-select] modal #groupSelectModal not found'); return; }
    if (typeof bootstrap === 'undefined') { console.warn('[group-select] bootstrap not loaded'); return; }

    const input = document.getElementById('gsGroupInput');
    const select = document.getElementById('gsSubgroupSelect');
    const title = document.getElementById('gsModalTitle');
    const hint = document.getElementById('gsHint');
    const cancelBtn = document.getElementById('gsCancelBtn');

    if (title) title.textContent = forced ? 'Выберите группу' : 'Сменить группу';
    if (cancelBtn) cancelBtn.style.display = forced ? 'none' : '';

    // Предзаполняем из localStorage (если есть)
    const savedGroup = localStorage.getItem('savedGroup') || '';
    const savedSub = localStorage.getItem('savedSubgroup') || '0';
    if (input) input.value = savedGroup;
    if (select) select.value = savedSub;

    if (hint) {
        hint.textContent = 'Начните вводить номер группы — например, ИВТ/б-24-1-о.';
        hint.className = 'small text-muted mb-2';
    }

    // Фокус на input — только один раз навешиваем обработчик shown.bs.modal
    if (!modalEl.dataset.focusHooked) {
        modalEl.addEventListener('shown.bs.modal', () => {
            const inp = document.getElementById('gsGroupInput');
            if (inp) { inp.focus(); inp.select(); }
        });
        modalEl.dataset.focusHooked = '1';
    }

    _groupSelectModalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    _groupSelectModalInstance.show();
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

    // Пишем в скрытые поля — их читает fetchSemesterData()
    document.getElementById('groupSelect').value = group;
    document.getElementById('subgroupSelect').value = subgroup;

    if (_groupSelectModalInstance) _groupSelectModalInstance.hide();

    // Обновляем #groupDisplay сразу (читает из DOM)
    updateGroupDisplay();

    // Основная загрузка (внутри — проверка справочника, "добавить?", сохранение
    // в localStorage, загрузка расписания)
    if (typeof fetchSemesterData === 'function') {
        await fetchSemesterData();
    }

    // Если fetchSemesterData НЕ сохранил группу (юзер отменил «добавить в справочник»),
    // откатываем поля к тому, что в localStorage
    const savedGroup = localStorage.getItem('savedGroup') || '';
    if (savedGroup !== group) {
        document.getElementById('groupSelect').value = savedGroup;
        document.getElementById('subgroupSelect').value = localStorage.getItem('savedSubgroup') || '0';
        updateGroupDisplay();
    }

    // Обновляем видимость шапки (мобилка): есть группа → compact, нет → onboarding
    if (typeof checkOnboarding === 'function') checkOnboarding();
}

// Читает группу из #groupSelect / #subgroupSelect (DOM), а не из localStorage.
// Так updateGroupDisplay корректно работает ДО того, как fetchSemesterData запишет savedGroup.
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
