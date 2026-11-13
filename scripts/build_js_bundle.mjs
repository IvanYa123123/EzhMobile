// Собирает JS-модули интерфейса в один app.bundle.js.
//
// index.html подключает только пакет, поэтому порядок модулей здесь должен
// совпадать с прежним порядком <script>-тегов: часть модулей рассчитывает
// на то, что предыдущие уже определены (см. state.js/main.js).
//
// Запуск:
//   node scripts/build_js_bundle.mjs           # пересобрать пакет
//   node scripts/build_js_bundle.mjs --check   # проверить, что все модули на месте

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULES = [
  'state', 'utils', 'ui', 'api', 'weeks', 'mini-calendar', 'calendar-cards',
  'calendar-day', 'calendar', 'navigation', 'status', 'tasks', 'friends',
  'custom-schedule', 'widgets-stats', 'widgets-labs', 'lab-items', 'widgets',
  'settings', 'teachers', 'search', 'autocomplete', 'notifications',
  'refresh', 'hotkeys', 'mobile', 'group-select',
  'moodle-pro', 'main',
];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DEFAULT_JS_DIR = path.join(ROOT, 'EzhAndroid', 'app', 'src', 'main', 'assets', 'static', 'js');
const BUNDLE_NAME = 'app.bundle.js';
const HEADER = '// Сгенерировано scripts/build_js_bundle.mjs — не редактировать вручную.\n';

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function build(jsDir) {
  const missing = MODULES.filter((name) => !existsSync(path.join(jsDir, name + '.js')));
  if (missing.length) throw new Error('нет модулей: ' + missing.join(', '));

  const parts = [HEADER];
  for (const name of MODULES) {
    const body = readFileSync(path.join(jsDir, name + '.js'), 'utf8').replace(/\r\n/g, '\n');
    parts.push(`// --- ${name}.js ---\n${body.trimEnd()}\n`);
  }
  const bundle = parts.join('\n;\n');
  writeFileSync(path.join(jsDir, BUNDLE_NAME), bundle, 'utf8');
  return bundle.length;
}

const jsDir = argValue('--js-dir', DEFAULT_JS_DIR);
const bundlePath = path.join(jsDir, BUNDLE_NAME);

if (process.argv.includes('--check')) {
  const missing = MODULES.filter((name) => !existsSync(path.join(jsDir, name + '.js')));
  if (missing.length) {
    console.error('нет модулей: ' + missing.join(', '));
    process.exit(1);
  }
  if (!existsSync(bundlePath)) {
    console.error('нет пакета: ' + bundlePath);
    process.exit(1);
  }
  console.log(`ok: ${MODULES.length} модулей, пакет собран`);
} else {
  const size = build(jsDir);
  console.log(`app.bundle.js: ${size} символов`);
}
