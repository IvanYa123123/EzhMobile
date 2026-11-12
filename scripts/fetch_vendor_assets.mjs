// Скачивает CDN-зависимости интерфейса в assets/static/vendor и assets/static/fonts.
//
// Запускать вручную или в CI перед сборкой APK:
//   node scripts/fetch_vendor_assets.mjs
//
// Файлы не коммитятся (см. .gitignore): без них index.html получает 404,
// window.bootstrap === undefined и календарь остаётся пустым.

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const STATIC = path.join(ROOT, 'EzhAndroid', 'app', 'src', 'main', 'assets', 'static');
const VENDOR = path.join(STATIC, 'vendor');
const FONTS = path.join(STATIC, 'fonts');

const FILES = [
  ['https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    path.join(VENDOR, 'bootstrap.min.css')],
  ['https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    path.join(VENDOR, 'bootstrap.bundle.min.js')],
  ['https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
    path.join(VENDOR, 'chart.umd.min.js')],
  ['https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2',
    path.join(FONTS, 'inter-variable.woff2')],
];

async function download(url, dst) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(dst, bytes);
  return bytes.length;
}

mkdirSync(VENDOR, { recursive: true });
mkdirSync(FONTS, { recursive: true });

for (const [url, dst] of FILES) {
  if (existsSync(dst) && statSync(dst).size > 1024) {
    console.log(`skip ${path.basename(dst)} (already exists)`);
    continue;
  }
  const size = await download(url, dst);
  console.log(`-> ${path.relative(ROOT, dst)} (${size} bytes)`);
}
console.log('done');
