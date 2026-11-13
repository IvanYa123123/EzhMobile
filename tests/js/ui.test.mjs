// Смоук-тест интерфейса: страница грузится целиком в jsdom против заглушечного
// сервера (tests/js/stub-server.mjs). Проверяются именно те места, где уже были баги.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;
const GROUP = 'ПИН/б-24-2-о';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, what, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`не дождались: ${what}`);
}

async function startServer() {
  const child = spawn(process.execPath, [path.join(HERE, 'stub-server.mjs')], {
    env: { ...process.env, EZH_TEST_PORT: String(PORT) },
    stdio: 'ignore',
  });
  await until(async () => {
    try {
      const r = await fetch(`${BASE}/api/health`);
      return r.ok;
    } catch (e) {
      return false;
    }
  }, 'запуска сервера', 60000);
  return child;
}

async function api(pathname, options = {}) {
  const r = await fetch(BASE + pathname, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  assert.ok(r.ok, `${pathname}: HTTP ${r.status}`);
  return r;
}

test('страница поднимается, настройки открываются, стрелки листают недели', async (t) => {
  const server = await startServer();
  t.after(() => server.kill());

  await api('/api/tracked_teachers', {
    method: 'POST',
    body: JSON.stringify({ name: 'Абаев Евгений Александрович', slug: 'abaev-evgenij-aleksandrovich' }),
  });
  await api('/api/friends', {
    method: 'POST',
    body: JSON.stringify({ name: 'Друг Всех Подгрупп', group: GROUP, subgroup: '0' }),
  });

  const pageErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => pageErrors.push(String((e && e.message) || e)));
  virtualConsole.on('error', (...args) => pageErrors.push(args.map(String).join(' ')));

  const dom = await JSDOM.fromURL(`${BASE}/`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.localStorage.setItem('savedGroup', GROUP);
      window.localStorage.setItem('savedSubgroup', '0');
      // jsdom не умеет fetch/AbortSignal в паре с node-fetch: мост без signal.
      // После закрытия окна ответы не должны трогать DOM — иначе node:test
      // ругается на асинхронную активность после теста.
      window.__closed = false;
      window.fetch = (input, init = {}) => {
        if (window.__closed) return new Promise(() => {});
        const url = typeof input === 'string' && input.startsWith('/') ? BASE + input
          : (input && input.url ? input.url : String(input));
        const options = { ...init };
        delete options.signal;
        return fetch(url, options);
      };
    },
  });
  const w = dom.window;
  t.after(() => w.close());

  await until(() => w.document.querySelectorAll('#calendar .day-col').length === 7,
    'рендера 7 дней');
  await until(() => w.document.getElementById('groupSelect').value === GROUP,
    'восстановления группы из localStorage');

  assert.equal(w.document.getElementById('groupSelect').value, GROUP);

  // Баг 1: настройки не открывались из-за ReferenceError при инициализации.
  w.eval('openSettingsModal()');
  // Bootstrap добавляет класс show асинхронно (через setTimeout), поэтому ждём.
  await until(() => {
    const modal = w.document.getElementById('settingsModal');
    return modal.classList.contains('show') && modal.getAttribute('aria-modal') === 'true';
  }, 'открытия модалки настроек');

  // Баг 2: переключатель «Друзья/Преподаватели» был скрыт на телефоне.
  const switcher = w.document.getElementById('peopleTabSwitcher');
  assert.ok(switcher, 'переключатель должен существовать');
  assert.notEqual(w.getComputedStyle(switcher).display, 'none',
    'переключатель не должен быть скрыт');
  assert.ok(switcher.parentElement.classList.contains('d-flex'),
    'обёртка переключателя должна быть видимой (d-flex, без d-none)');
  assert.ok(switcher.parentElement.classList.contains('my-2'),
    'у переключателя одинаковые отступы сверху и снизу');
  assert.ok(!switcher.parentElement.classList.contains('mt-3'),
    'увеличенный верхний отступ убран');

  // Подсказка «Начните вводить номер группы» удалена.
  assert.equal((w.document.getElementById('gsHint').textContent || '').trim(), '',
    'серая подсказка в модалке группы должна исчезнуть');

  // Настройки переехали в нижнюю панель — пятая кнопка.
  const navItems = w.document.querySelectorAll('#mobileBottomNav .mobile-nav-item');
  assert.equal(navItems.length, 5, 'в нижней панели пять кнопок');
  assert.ok(navItems[4].textContent.includes('Настройки'), 'последняя кнопка — настройки');

  w.eval("switchFriendsTeachersTab('teachers')");
  await until(() => w.document.querySelectorAll('#teachersCalendarsContainer .teacher-pair-card').length > 0,
    'расписания преподавателя');
  assert.ok(w.document.getElementById('teachersSection'));

  // Баг 5: у друга с «все подгруппы» это должно быть видно в заголовке.
  w.eval("switchFriendsTeachersTab('friends')");
  await until(() => (w.document.getElementById('friendsCalendarsContainer').textContent || '').includes('все подгруппы'),
    'подписи подгруппы у друга');

  // Стрелки ↑/↓ перестановки друга удалены вместе с логикой порядка.
  const friendArrows = w.document.querySelectorAll(
    '#friendsCalendarsContainer [title="Выше"], #friendsCalendarsContainer [title="Ниже"]');
  assert.equal(friendArrows.length, 0, 'стрелки перестановки у друга удалены');

  const referenceErrors = pageErrors.filter((e) => e.includes('ReferenceError'));
  assert.deepEqual(referenceErrors, [], `на странице были ReferenceError: ${referenceErrors.join('; ')}`);
  // Баг 4: после вкладки «День» стрелки листали на день, а не на неделю.
  w.eval("switchMobileTab('day')");
  w.eval("switchMobileTab('schedule')");
  const before = w.eval('currentBaseDate.getTime()');
  w.eval('changeWeek(1)');
  const after = w.eval('currentBaseDate.getTime()');
  assert.equal(after - before, 7 * 24 * 60 * 60 * 1000, 'неделя должна листаться на 7 дней');



  // Статус-строка показывается и во вкладке «День».
  w.eval('updateScheduleStatus()');
  const statusDesktop = w.document.getElementById('scheduleStatus').textContent;
  assert.equal(w.document.getElementById('dayScheduleStatus').textContent, statusDesktop,
    'статус-строка должна быть и в «Дне»');
  assert.ok(statusDesktop.length > 0, 'статус-строка не пустая при наличии пар');

  // Кнопка «Настройки» в нижней панели открывает отдельную вкладку.
  assert.ok((navItems[4].getAttribute('onclick') || '').includes('openSettingsModal'),
    'кнопка «Настройки» открывает вкладку настроек');
  assert.equal(navItems.length, 5, 'в нижней панели пять вкладок');

  // Стрелки календаря удалены: недели листаются свайпами.
  assert.equal(w.document.querySelectorAll('.calendar-nav-row .nav-arrow').length, 0,
    'стрелки листания недель убраны');
  // 4 кнопки навигации по заметкам/событиям во вкладке «День» удалены.
  assert.equal(w.document.getElementById('dayNavPanel'), null,
    'лишние кнопки в «Дне» убраны');
  // Точность статус-строки только «до минуты»/«до секунды».
  assert.equal(w.document.querySelector('#settingsStatusPrecision option[value="cs"]'), null,
    'точность «до сотых» убрана');
  // Модалки открываются по центру, а не сверху.
  for (const dialog of w.document.querySelectorAll('.modal-dialog')) {
    assert.ok(dialog.classList.contains('modal-dialog-centered'),
      `модалка должна быть по центру: ${dialog.parentElement && dialog.parentElement.id}`);
  }
  // Настройки — отдельная вкладка, контент переезжает в неё на телефоне.
  assert.ok(w.document.getElementById('settingsTabContainer'), 'есть вкладка настроек');
  assert.ok(w.document.getElementById('settingsTabHost'), 'есть контейнер настроек во вкладке');

  // Раскрытый список пар показывает стрелку вверх, пустой день — «Свободный день».
  for (const arrow of w.document.querySelectorAll('#calendar span[id^="arrow-"]')) {
    assert.equal(arrow.textContent, '▲', 'раскрытый день: стрелка вверх');
  }
  assert.ok(!w.document.getElementById('calendar').innerHTML.includes('☕ Свободно'),
    'без эмодзи и слова «Свободно»');

  // «К текущему дню» работает и во вкладке «День».
  w.eval("switchMobileTab('day')");
  w.eval("window.expandedDayDateStr = '2026-01-01'");
  w.eval('goToToday()');
  assert.equal(w.eval('window.expandedDayDateStr'), w.eval('getLocalDateStr(new Date())'),
    'кнопка «сегодня» возвращает текущий день и в «Дне»');

  // Гасим фоновые запросы и таймеры приложения до закрытия окна.
  w.__closed = true;
  w.eval('for (let i = 1; i < 20000; i++) { clearTimeout(i); clearInterval(i); }');
  await sleep(200);
});

test('телефон: настройки открываются вкладкой, свайпы листают недели', async (t) => {
  const port = 5100;
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(HERE, 'stub-server.mjs')], {
    env: { ...process.env, EZH_TEST_PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(() => server.kill());
  await until(async () => {
    try {
      return (await fetch(`${base}/api/health`)).ok;
    } catch (e) {
      return false;
    }
  }, 'запуска сервера', 60000);

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(String((e && e.message) || e)));
  virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));

  const dom = await JSDOM.fromURL(`${base}/`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
      window.localStorage.setItem('savedGroup', GROUP);
      window.localStorage.setItem('savedSubgroup', '0');
      window.__closed = false;
      window.fetch = (input, init = {}) => {
        if (window.__closed) return new Promise(() => {});
        const url = typeof input === 'string' && input.startsWith('/') ? base + input
          : (input && input.url ? input.url : String(input));
        const options = { ...init };
        delete options.signal;
        return fetch(url, options);
      };
    },
  });
  const w = dom.window;
  t.after(() => w.close());

  await until(() => w.document.querySelectorAll('#calendar .day-col').length === 7,
    'рендера 7 дней');

  // 1. Настройки открываются отдельной вкладкой, модалка не показывается.
  w.eval('openSettingsModal()');
  // Форма заполнена текущими значениями: иначе любое изменение сохранит
  // выключенные чекбоксы и светлую тему (старый баг).
  assert.equal(w.document.getElementById('settingsToggleTeacher').checked, true,
    'в настройках показано актуальное значение «преподаватель»');
  assert.equal(w.document.getElementById('settingsTheme').value, 'light',
    'в настройках показана текущая тема');
  const teacherCb = w.document.getElementById('settingsToggleTeacher');
  teacherCb.checked = false;
  teacherCb.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(w.localStorage.getItem('showTeacher'), 'false', 'изменение настройки сохраняется');
  assert.equal(w.localStorage.getItem('theme'), 'light', 'чужая настройка (тема) не сбрасывается');
  assert.equal(w.document.body.getAttribute('data-mobile-tab'), 'settings',
    'настройки переключили вкладку');
  const content = w.document.getElementById('settingsContent');
  assert.equal(content.parentElement.id, 'settingsTabHost', 'контент переехал во вкладку');
  assert.ok(!w.document.getElementById('settingsModal').classList.contains('show'),
    'на телефоне модалка настроек не открывается');

  // 2. Свайп в «Расписании» листает неделю.
  w.eval("switchMobileTab('schedule')");
  const before = w.eval('currentBaseDate.getTime()');
  w.eval('window.swipeWeek(1)');
  assert.equal(w.eval('currentBaseDate.getTime()') - before, 7 * 24 * 60 * 60 * 1000,
    'свайп листает неделю в «Расписании»');

  // 3. Свайп в «Дне» листает соседний день (а не неделю).
  w.eval("switchMobileTab('day')");
  const dayBefore = w.eval('window.expandedDayDateStr');
  w.eval('window.swipeWeek(1)');
  const dayAfter = w.eval('window.expandedDayDateStr');
  const delta = (new Date(dayAfter) - new Date(dayBefore)) / (24 * 60 * 60 * 1000);
  assert.equal(delta, 1, 'свайп в «Дне» сдвигает дату на один день');

  const refs = errors.filter((e) => e.includes('ReferenceError'));
  assert.deepEqual(refs, [], `на странице были ReferenceError: ${refs.join('; ')}`);

  w.__closed = true;
  w.eval('for (let i = 1; i < 20000; i++) { clearTimeout(i); clearInterval(i); }');
  await sleep(200);
});
