// Смоук-тест интерфейса: страница грузится целиком в jsdom против заглушечного
// сервера (tests/stub_server.py). Проверяются именно те места, где уже были баги.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const APP_DIR = path.join(ROOT, 'EzhAndroid', 'app', 'src', 'main', 'python');
const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}`;
const GROUP = 'ПИН/б-24-2-о';
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

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

async function startServer(dataDir) {
  const child = spawn(PYTHON, [path.join(ROOT, 'tests', 'stub_server.py')], {
    env: { ...process.env, EZH_DATA_DIR: dataDir, EZH_TEST_PORT: String(PORT) },
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
  const dataDir = mkdtempSync(path.join(tmpdir(), 'ezh-ui-'));
  copyFileSync(path.join(APP_DIR, 'teachers.json'), path.join(dataDir, 'teachers.json'));
  const server = await startServer(dataDir);
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

  w.eval("switchFriendsTeachersTab('teachers')");
  await until(() => w.document.querySelectorAll('#teachersCalendarsContainer .teacher-pair-card').length > 0,
    'расписания преподавателя');
  assert.ok(w.document.getElementById('teachersSection'));

  // Баг 5: у друга с «все подгруппы» это должно быть видно в заголовке.
  w.eval("switchFriendsTeachersTab('friends')");
  await until(() => (w.document.getElementById('friendsCalendarsContainer').textContent || '').includes('все подгруппы'),
    'подписи подгруппы у друга');

  const referenceErrors = pageErrors.filter((e) => e.includes('ReferenceError'));
  assert.deepEqual(referenceErrors, [], `на странице были ReferenceError: ${referenceErrors.join('; ')}`);
  // Баг 4: после вкладки «День» стрелки листали на день, а не на неделю.
  w.eval("switchMobileTab('day')");
  w.eval("switchMobileTab('schedule')");
  const before = w.eval('currentBaseDate.getTime()');
  w.eval('navigateNext()');
  const after = w.eval('currentBaseDate.getTime()');
  assert.equal(after - before, 7 * 24 * 60 * 60 * 1000, 'стрелка должна листать неделю');

  // Гасим фоновые запросы и таймеры приложения до закрытия окна.
  w.__closed = true;
  w.eval('for (let i = 1; i < 20000; i++) { clearTimeout(i); clearInterval(i); }');
  await sleep(200);
});
