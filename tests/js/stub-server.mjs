// Заглушка сервера для jsdom-смоук-теста интерфейса.
//
// Отдаёт настоящую статику из assets/static и минимальный набор API с
// фиктивными данными (расписание на 3 недели, преподаватель, друзья).
// Никакого Python и Android не нужно — только Node.

import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '..', '..', 'EzhAndroid', 'app', 'src', 'main', 'assets');
const STATIC = path.join(ASSETS, 'static');
const PORT = Number(process.env.EZH_TEST_PORT || 5099);
const GROUP = 'ПИН/б-24-2-о';
const GROUPS = [GROUP, 'ПИН/б-24-1-о', 'ИВТ/б-24-2-о'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function monday(offsetWeeks = 0) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = (now.getDay() + 6) % 7;
  return new Date(now.getTime() - day * 86400000 + offsetWeeks * 7 * 86400000);
}

function iso(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function dayAt(offsetWeeks, dayIndex) {
  return new Date(monday(offsetWeeks).getTime() + dayIndex * 86400000);
}

function schedule() {
  const items = [];
  for (let week = 0; week < 3; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      items.push({
        date: iso(dayAt(week, day)),
        n: 1,
        time_range: '08:30 - 10:00',
        lesson: 'Математический анализ',
        type_name: 'Лекция',
        teacher: 'Иванов Иван Иванович',
        location: 'А-101',
        subgroup: '0',
      });
    }
  }
  return items;
}

function teacherPairs() {
  const items = [];
  for (let day = 0; day < 7; day += 1) {
    items.push({
      date: iso(dayAt(0, day)),
      n: 2,
      time_range: '10:10 - 11:40',
      lesson: 'Практикум по математике',
      type_name: 'ПЗ',
      location: 'Б-202',
      groups: [GROUP],
    });
  }
  return items;
}

let nextFriendId = 1;
let nextTeacherId = 1;
const friends = [];
const tracked = [];

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function serveStatic(res, urlPath) {
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/static\//, '');
  if (!relative || relative.includes('..')) return sendText(res, 404, 'not found');
  const file = path.join(STATIC, relative);
  if (!existsSync(file) || !statSync(file).isFile()) return sendText(res, 404, 'not found');
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;

  if (req.method === 'GET' && (p === '/' || p.startsWith('/static/'))) {
    return serveStatic(res, p);
  }

  try {
    if (p === '/api/health') return sendJson(res, 200, { ok: true, version: '0.8' });

    if (p === '/api/groups') return sendJson(res, 200, GROUPS);

    if (p === '/api/groups/custom' && req.method === 'POST') {
      return sendJson(res, 200, { success: true });
    }

    if (p === '/api/tasks' && req.method === 'GET') return sendJson(res, 200, []);
    if (p === '/api/tasks' && req.method === 'POST') return sendJson(res, 200, { id: 1 });
    if (p === '/api/task_dates') return sendJson(res, 200, []);

    if (p === '/api/friends' && req.method === 'GET') return sendJson(res, 200, friends);
    if (p === '/api/friends' && req.method === 'POST') {
      const data = await readJson(req);
      const friend = {
        id: nextFriendId,
        name: String(data.name || ''),
        group: String(data.group || ''),
        subgroup: String(data.subgroup || '0'),
      };
      nextFriendId += 1;
      friends.push(friend);
      return sendJson(res, 200, { ...friend, success: true });
    }

    if (p === '/api/subjects' && req.method === 'GET') return sendJson(res, 200, {});
    if (p === '/api/custom_schedule' && req.method === 'GET') return sendJson(res, 200, []);
    if (p === '/api/labs' && req.method === 'GET') return sendJson(res, 200, {});
    if (p === '/api/lab_items' && req.method === 'GET') return sendJson(res, 200, {});

    if (p === '/api/teachers' && req.method === 'GET') {
      return sendJson(res, 200, [{ name: 'Абаев Евгений Александрович', slug: 'abaev-evgenij-aleksandrovich' }]);
    }
    if (p === '/api/teacher_schedule') return sendJson(res, 200, teacherPairs());

    if (p === '/api/tracked_teachers' && req.method === 'GET') return sendJson(res, 200, tracked);
    if (p === '/api/tracked_teachers' && req.method === 'POST') {
      const data = await readJson(req);
      const slug = String(data.slug || '').toLowerCase();
      const existing = tracked.find((t) => t.slug === slug);
      if (existing) return sendJson(res, 200, { ...existing, already: true });
      const teacher = { id: nextTeacherId, name: String(data.name || ''), slug };
      nextTeacherId += 1;
      tracked.push(teacher);
      return sendJson(res, 200, { ...teacher, already: false });
    }

    if (p === '/api/schedule_all') return sendJson(res, 200, schedule());
    if (p === '/api/schedule_sync') return sendJson(res, 200, schedule());

    if (p === '/api/moodle/status') return sendJson(res, 200, { logged_in: false });

    return sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    return sendJson(res, 500, { error: String((e && e.message) || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`stub server: http://127.0.0.1:${PORT}`);
});
