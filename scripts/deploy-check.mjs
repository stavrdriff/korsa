// Перевірка зібраної папки deploy/korsa перед передачею на хостинг.
//
//   npm run deploy:check
//
// Робить те саме, що буде на хостингу: копіює папку в тимчасову теку,
// ставить залежності (npm ci --omit=dev), запускає сервер через app.cjs
// і перевіряє сторінки, картинки, адмінку та закриті файли.
// Сама папка deploy/korsa не змінюється.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'deploy', 'korsa');
const ZIP = path.join(ROOT, 'deploy', 'korsa.zip');

const failures = [];
let passed = 0;
function check(ok, label, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
  return ok;
}
function section(title) {
  console.log(`\n${title}`);
}
function readEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(APP)) {
  console.error(`Немає ${APP}. Спершу виконайте: npm run deploy`);
  process.exit(1);
}

// ── 1. Склад папки ───────────────────────────────────────────────
section('1. Склад папки deploy/korsa');
for (const item of ['.env', 'app.cjs', 'package.json', 'package-lock.json', 'DEPLOY.md',
  'admin/index.html', 'admin/login.html', 'assets/style.css', 'assets/script.js',
  'public/index.html', 'server/index.js', 'data/cms.sqlite', 'data/uploads', 'img']) {
  check(fs.existsSync(path.join(APP, item)), item);
}
check(!fs.existsSync(path.join(APP, 'node_modules')), 'немає node_modules (cPanel ставить сам)');
check(!fs.existsSync(path.join(APP, 'old')), 'немає old/');
const stray = fs.readdirSync(path.join(APP, 'data')).filter((f) => /\.sqlite-(wal|shm)$/.test(f));
check(stray.length === 0, 'база без службових -wal/-shm файлів', stray.join(', '));

const env = fs.existsSync(path.join(APP, '.env')) ? readEnv(path.join(APP, '.env')) : {};
section('2. Налаштування .env');
check(/^https:\/\/[^/]+$/.test(env.SITE_URL || ''), `SITE_URL = ${env.SITE_URL || '(порожньо)'}`, 'має бути https://домен без слеша в кінці');
check((env.SESSION_SECRET || '').length >= 32 && env.SESSION_SECRET !== 'change-me-to-a-long-random-string', 'SESSION_SECRET задано (≥ 32 символи)');
check(Boolean(env.ADMIN_USER), `ADMIN_USER = ${env.ADMIN_USER || '(порожньо)'}`);
check(Boolean(env.ADMIN_PASSWORD_PREFIX), 'ADMIN_PASSWORD_PREFIX задано');
check(!('PORT' in env), 'PORT не задано (його визначає хостинг)');

// ── 3. Архів ─────────────────────────────────────────────────────
if (fs.existsSync(ZIP)) {
  section('3. Архів korsa.zip');
  const t = spawnSync('unzip', ['-tq', ZIP], { encoding: 'utf8' });
  check(t.status === 0, 'архів не пошкоджений', (t.stdout + t.stderr).trim().slice(0, 200));
  const list = spawnSync('unzip', ['-Z1', ZIP], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const names = list.stdout.split('\n').filter((n) => n && !n.endsWith('/'));
  const files = spawnSync('find', [APP, '-type', 'f'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .stdout.split('\n').filter(Boolean).length;
  check(names.length === files, `у архіві ${names.length} файлів, у папці ${files}`);
  check(names.includes('korsa/.env'), 'в архіві є .env');
} else {
  section('3. Архів korsa.zip — не зібрано, пропускаю');
}

// ── 4. Запуск як на хостингу ─────────────────────────────────────
section('4. Запуск у тимчасовій копії (npm ci + app.cjs)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'korsa-check-'));
let server;
try {
  for (const name of fs.readdirSync(APP)) {
    if (name === 'img') continue; // картинки не копіюємо, а підключаємо посиланням — швидше
    fs.cpSync(path.join(APP, name), path.join(tmp, name), { recursive: true });
  }
  fs.symlinkSync(path.join(APP, 'img'), path.join(tmp, 'img'));

  const ci = spawnSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: tmp, encoding: 'utf8' });
  if (!check(ci.status === 0, 'npm ci --omit=dev', ci.stderr.trim().split('\n').slice(-3).join(' | '))) {
    throw new Error('stop');
  }

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let log = '';
  server = spawn(process.execPath, ['-e', "require('./app.cjs')"], {
    cwd: tmp,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
  });
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });

  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await fetch(base + '/')).ok; } catch { await sleep(250); }
  }
  if (!check(up, 'сервер стартував через app.cjs', log.trim().slice(-300))) throw new Error('stop');

  const get = (p, opts) => fetch(base + p, opts).catch((e) => ({ ok: false, status: e.code || 'ERR', headers: new Headers() }));

  // ── 5. Сторінки сайту ──
  section('5. Сторінки сайту');
  const pages = fs.readdirSync(path.join(tmp, 'public')).filter((f) => f.endsWith('.html'));
  const badPages = [];
  const localRefs = new Set();
  for (const page of pages) {
    const res = await get(`/${page === 'index.html' ? '' : page}`);
    if (!res.ok) { badPages.push(`${page} (${res.status})`); continue; }
    const html = await res.text();
    for (const m of html.matchAll(/\b(?:src|href|poster)="((?:img|assets)\/[^"#?]+)"/g)) localRefs.add(m[1]);
    for (const m of html.matchAll(/url\('?((?:\.\.\/)?(?:img|assets)\/[^')]+)'?\)/g)) localRefs.add(m[1].replace(/^\.\.\//, ''));
  }
  check(badPages.length === 0, `усі ${pages.length} сторінок відкриваються`, badPages.slice(0, 5).join(', '));

  const badRefs = [];
  for (const ref of localRefs) {
    const res = await get('/' + ref.split('/').map(encodeURIComponent).join('/'), { method: 'HEAD' });
    if (!res.ok) badRefs.push(`${ref} (${res.status})`);
  }
  check(badRefs.length === 0, `усі ${localRefs.size} картинок/відео/стилів зі сторінок на місці`, badRefs.slice(0, 5).join(', '));

  const sitemap = await (await get('/sitemap.xml')).text?.() ?? '';
  check(sitemap.includes(`<loc>${env.SITE_URL}/</loc>`), `sitemap.xml з доменом ${env.SITE_URL}`);
  const robots = await (await get('/robots.txt')).text?.() ?? '';
  check(robots.includes(`Sitemap: ${env.SITE_URL}/sitemap.xml`), 'robots.txt посилається на sitemap');

  // ── 6. Закриті файли ──
  section('6. Службові файли недоступні з браузера');
  for (const p of ['/.env', '/data/cms.sqlite', '/server/config.js', '/package.json', '/old/', '/node_modules/express/package.json']) {
    const res = await get(p);
    check(!res.ok, `${p} → ${res.status}`);
  }

  // ── 7. Адмінка ──
  section('7. Адмінка');
  check((await get('/admin/')).ok, '/admin/ відкривається');
  check((await get('/api/auth/me')).status === 401, 'API без входу закрите (401)');

  const login = (password, minute) => get('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: env.ADMIN_USER, password, clientMinute: minute }),
  });
  const now = new Date().getMinutes();
  const mm = String(now).padStart(2, '0');
  check((await login(`wrong${mm}`, now)).status === 401, 'неправильний пароль не пускає');
  const ok = await login(`${env.ADMIN_PASSWORD_PREFIX}${mm}`, now);
  const cookie = ok.headers.get('set-cookie')?.split(';')[0];
  if (check(ok.ok && cookie, `вхід ${env.ADMIN_USER} / ${env.ADMIN_PASSWORD_PREFIX}${mm}`, `статус ${ok.status}; логін береться з бази (settings.admin_user)`)) {
    const pub = await get('/api/publish', { method: 'POST', headers: { cookie } });
    const body = pub.ok ? await pub.json() : {};
    check(pub.ok && body.ok, `«Опублікувати» працює (${body.pages ?? 0} сторінок, ${body.products ?? 0} товарів)`);
    check((await get('/')).ok, 'сайт відкривається після публікації');
  }
} catch (e) {
  if (e.message !== 'stop') check(false, 'неочікувана помилка', e.stack);
} finally {
  server?.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${failures.length ? '✗' : '✓'} Пройдено ${passed}, помилок ${failures.length}`);
if (failures.length) {
  console.log('Не передавайте папку, поки не виправите:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('Папка deploy/korsa готова до передачі.');
