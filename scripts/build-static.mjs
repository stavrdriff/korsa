// Збирає статичну версію сайту в dist/: HTML-сторінки, стилі, скрипт і всі
// картинки та відео, на які посилаються сторінки. Папку можна відкрити
// в браузері прямо з диска або залити на Netlify.
//
//   npm run build
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR, ROOT, UPLOADS_DIR } from '../server/config.js';
import { publishAllPages } from '../server/builder/pages.js';
import { publishAllProducts } from '../server/builder/product.js';
import { ensureStattiPosters } from '../server/routes/pages.js';

const DIST = path.join(ROOT, 'dist');

// Атрибути й url(...), у яких можуть бути посилання на файли
const REF_RE = /((?:href|src|poster|data-video)\s*=\s*["'])([^"']*)(["'])|(url\(\s*["']?)([^"')]*)(["']?\s*\))/gi;

function isLocal(ref) {
  return ref && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);
}

/** «/uploads/a.jpg» → «uploads/a.jpg», «/» → «index.html»: з диска абсолютні шляхи не працюють */
function toRelative(ref) {
  if (!isLocal(ref) || !ref.startsWith('/')) return ref;
  const rel = ref.replace(/^\/+/, '');
  return rel === '' || rel.startsWith('#') || rel.startsWith('?') ? `index.html${rel}` : rel;
}

/** Файл на диску для посилання з кореня сайту */
function sourceOf(ref) {
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  if (clean.startsWith('uploads/')) return path.join(UPLOADS_DIR, clean.slice('uploads/'.length));
  if (clean.endsWith('.html') && !clean.includes('/')) return path.join(PUBLIC_DIR, clean);
  return path.join(ROOT, clean);
}

function rewriteRefs(text, found) {
  return text.replace(REF_RE, (match, a1, ref1, a3, u1, ref2, u3) => {
    const ref = ref1 ?? ref2;
    const rel = toRelative(ref);
    if (isLocal(rel)) found.add(rel.split(/[?#]/)[0]);
    return a1 ? `${a1}${rel}${a3}` : `${u1}${rel}${u3}`;
  });
}

function copyFile(from, rel) {
  const to = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

await ensureStattiPosters();
const pages = publishAllPages();
const products = publishAllProducts().filter((p) => !p.skipped);
console.log(`→ Згенеровано з бази: сторінок ${pages.length}, товарів ${products.length}`);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const refs = new Set();
const htmlFiles = fs.readdirSync(PUBLIC_DIR).filter((name) => name.endsWith('.html'));
for (const name of htmlFiles) {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8');
  fs.writeFileSync(path.join(DIST, name), rewriteRefs(html, refs), 'utf8');
}
// sitemap, robots, фавіконки й маніфест — усе, що лежить у public/ поруч зі сторінками
for (const name of fs.readdirSync(PUBLIC_DIR)) {
  const from = path.join(PUBLIC_DIR, name);
  if (!name.endsWith('.html') && fs.statSync(from).isFile()) copyFile(from, name);
}

// Стилі та скрипт копіюємо цілком; посилання з CSS рахуються від папки assets/
for (const name of fs.readdirSync(path.join(ROOT, 'assets'))) {
  const from = path.join(ROOT, 'assets', name);
  if (name.endsWith('.css')) {
    const cssRefs = new Set();
    const css = rewriteRefs(fs.readFileSync(from, 'utf8'), cssRefs);
    for (const ref of cssRefs) refs.add(path.posix.normalize(`assets/${ref}`));
    fs.writeFileSync(path.join(DIST, 'assets', name), css, 'utf8');
  } else if (fs.statSync(from).isFile()) {
    copyFile(from, `assets/${name}`);
  }
}

const missing = [];
let copied = 0;
for (const ref of refs) {
  if (!ref || ref.endsWith('/') || fs.existsSync(path.join(DIST, decodeURIComponent(ref)))) continue;
  const from = sourceOf(ref);
  if (fs.existsSync(from) && fs.statSync(from).isFile()) {
    copyFile(from, decodeURIComponent(ref));
    copied += 1;
  } else {
    missing.push(ref);
  }
}

let bytes = 0;
let files = 0;
for (const entry of fs.readdirSync(DIST, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  files += 1;
  bytes += fs.statSync(path.join(entry.parentPath, entry.name)).size;
}

console.log(`→ dist/: сторінок ${htmlFiles.length}, картинок і відео ${copied}, усього файлів ${files}, ${(bytes / 1024 / 1024).toFixed(0)} МБ`);
if (missing.length) {
  console.error(`✗ Немає файлів, на які посилаються сторінки (${missing.length}):`);
  for (const ref of missing.sort()) console.error(`   ${ref}`);
  process.exit(1);
}
console.log(`✓ Готово: ${DIST}`);
console.log('  Відкрийте dist/index.html у браузері або залийте папку dist/ на Netlify.');
