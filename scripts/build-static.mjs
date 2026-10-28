// Збирає статичну версію сайту в dist/: HTML-сторінки, стилі, скрипт і всі
// картинки та відео, на які посилаються сторінки. Папку можна відкрити
// в браузері прямо з диска або залити на Netlify.
//
//   npm run build
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PUBLIC_DIR, ROOT, SITE_URL, UPLOADS_DIR } from '../server/config.js';
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

// JPG/PNG → WebP: на сайт ідуть стиснені копії, оригінали в img/ та uploads/ лишаються як є.
// Готові WebP кешуються за вмістом файлу, тож повторна збірка конвертує лише нові картинки.
const WEBP_CACHE = path.join(ROOT, 'node_modules', '.cache', 'webp');
const WEBP_MAX_WIDTH = 2000;
const WEBP_QUALITY = 80;
const RASTER_RE = /\.(?:jpe?g|png)(?=$|[?#])/i;
// Ширини зменшених копій: телефон (480, 800 — для екранів 2x), планшет (1200), великий екран (1600)
const SRCSET_WIDTHS = [480, 800, 1200, 1600];
/** Повний WebP → усі його розміри від найменшого: [{ ref, w }] */
const responsive = new Map();

function webpName(ref) {
  return ref.replace(RASTER_RE, '.webp');
}

async function convertToWebp(rel) {
  const file = path.join(DIST, decodeURIComponent(rel));
  // Ключ кешу — оригінал у img/ чи uploads/: його дата зміни не скидається при кожній збірці
  const original = fs.statSync(sourceOf(rel));
  const before = original.size;
  const cached = path.join(WEBP_CACHE, `${crypto.hash('sha1', `${rel}:${before}:${original.mtimeMs}`)}.webp`);
  if (!fs.existsSync(cached)) {
    const webp = await sharp(file)
      .rotate()
      .resize({ width: WEBP_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    fs.writeFileSync(cached, webp);
  }
  const size = fs.statSync(cached).size;
  if (size >= before) return null;
  const full = webpName(rel);
  copyFile(cached, decodeURIComponent(full));

  // Зменшені копії для srcset: телефону й планшету не треба тягнути повний розмір
  const { width } = await sharp(cached).metadata();
  const candidates = [];
  let after = size;
  for (const w of SRCSET_WIDTHS.filter((n) => n < width)) {
    const variant = cached.replace(/\.webp$/, `-${w}.webp`);
    if (!fs.existsSync(variant)) {
      fs.writeFileSync(variant, await sharp(cached).resize({ width: w }).webp({ quality: WEBP_QUALITY }).toBuffer());
    }
    const ref = full.replace(/\.webp$/, `-${w}w.webp`);
    copyFile(variant, decodeURIComponent(ref));
    candidates.push({ ref, w });
    after += fs.statSync(variant).size;
  }
  if (candidates.length) responsive.set(full, [...candidates, { ref: full, w: width }]);
  return { before, after: size, total: after };
}

// og:image має лишатися JPG — не всі месенджери показують WebP у прев'ю
const ogKeep = new Set();
for (const name of htmlFiles) {
  const html = fs.readFileSync(path.join(DIST, name), 'utf8');
  for (const [, url] of html.matchAll(/<meta property="og:image" content="([^"]*)"/g)) {
    if (url.startsWith(`${SITE_URL}/`)) ogKeep.add(url.slice(SITE_URL.length + 1));
  }
}

fs.mkdirSync(WEBP_CACHE, { recursive: true });
// Лише фото з img/ та uploads/: фавіконки з public/ мають лишатися PNG
const rasters = [...refs].filter(
  (ref) => /^(?:img|uploads)\//.test(ref) && RASTER_RE.test(ref) && fs.existsSync(path.join(DIST, decodeURIComponent(ref)))
);
const webps = new Set();
const broken = [];
let webpBefore = 0;
let webpAfter = 0;
let srcsetBytes = 0;
for (let i = 0; i < rasters.length; i += 8) {
  await Promise.all(
    rasters.slice(i, i + 8).map(async (rel) => {
      const result = await convertToWebp(rel).catch((err) => {
        broken.push(`${rel}: ${err.message}`);
        return null;
      });
      if (!result) return;
      webps.add(rel);
      webpBefore += result.before;
      webpAfter += result.after;
      srcsetBytes += result.total - result.after;
      if (!ogKeep.has(rel)) fs.rmSync(path.join(DIST, decodeURIComponent(rel)));
    })
  );
}

/** Підміняє посилання на картинки, для яких є WebP; base — папка, від якої рахуються посилання у файлі */
function useWebp(text, base) {
  return text.replace(REF_RE, (match, a1, ref1, a3, u1, ref2, u3) => {
    const ref = ref1 ?? ref2;
    const key = path.posix.normalize(path.posix.join(base, ref.split(/[?#]/)[0]));
    if (!isLocal(ref) || !webps.has(key)) return match;
    return a1 ? `${a1}${webpName(ref)}${a3}` : `${u1}${webpName(ref)}${u3}`;
  });
}

// Яку ширину займає картинка на екрані — за класом найближчого батьківського блоку.
// Mobile first: src — найменша копія, а в sizes умови min-width ідуть від більшого екрана,
// останнє значення (без умови) — для телефону.
const SIZES_BY_PARENT = {
  gallery__item: '(min-width: 993px) 180px, 120px',
  'product__img-wrap': '(min-width: 993px) 300px, (min-width: 600px) 30vw, (min-width: 380px) 50vw, calc(100vw - 44px)',
  cat__media: '(min-width: 993px) 400px, calc(100vw - 44px)',
  'video-card': '(min-width: 993px) 300px, calc(100vw - 44px)',
  'post-shot': '(min-width: 808px) 760px, 100vw',
};
const SIZES_DEFAULT = '(min-width: 1288px) 1240px, calc(100vw - 44px)';

function sizesFor(tag, before) {
  const fixed = tag.match(/\swidth="(\d+)"/i) || tag.match(/style="[^"]*(?:^|[;"\s])width:\s*(\d+)px/i);
  if (fixed) return `${fixed[1]}px`;
  const parents = [...before.matchAll(/<[a-z][^>]*\bclass="([^"]*)"/gi)];
  const parent = parents.at(-1)?.[1].split(/\s+/).find((cls) => SIZES_BY_PARENT[cls]);
  return parent ? SIZES_BY_PARENT[parent] : SIZES_DEFAULT;
}

/** Додає srcset і sizes до <img>, для яких зібрано зменшені копії */
function useSrcset(html) {
  return html.replace(/<img\b[^>]*>/gi, (tag, offset) => {
    if (/\ssrcset=/i.test(tag)) return tag;
    const src = tag.match(/\ssrc="([^"]*)"/i)?.[1];
    const set = src && responsive.get(src);
    if (!set) return tag;
    const srcset = set.map(({ ref, w }) => `${ref} ${w}w`).join(', ');
    const sizes = sizesFor(tag, html.slice(Math.max(0, offset - 400), offset));
    return tag.replace(/\ssrc="[^"]*"/i, ` src="${set[0].ref}" srcset="${srcset}" sizes="${sizes}"`);
  });
}

for (const name of htmlFiles) {
  const file = path.join(DIST, name);
  fs.writeFileSync(file, useSrcset(useWebp(fs.readFileSync(file, 'utf8'), '.')), 'utf8');
}
for (const name of fs.readdirSync(path.join(DIST, 'assets')).filter((n) => n.endsWith('.css'))) {
  const file = path.join(DIST, 'assets', name);
  fs.writeFileSync(file, useWebp(fs.readFileSync(file, 'utf8'), 'assets'), 'utf8');
}
const mb = (n) => (n / 1024 / 1024).toFixed(0);
console.log(`→ WebP: ${webps.size} з ${rasters.length} картинок, ${mb(webpBefore)} МБ → ${mb(webpAfter)} МБ`);
console.log(`→ srcset: зменшені копії для ${responsive.size} картинок, ще ${mb(srcsetBytes)} МБ`);
if (broken.length) {
  console.warn(`! Не вдалося перетворити на WebP — лишилися як є (${broken.length}):`);
  for (const line of broken.sort()) console.warn(`   ${line}`);
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
