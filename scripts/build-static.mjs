// Збирає статичну версію сайту в dist/: HTML-сторінки, стилі, скрипт і всі
// картинки та відео, на які посилаються сторінки. Папку можна відкрити
// в браузері прямо з диска або залити на Netlify.
//
//   npm run build
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { transform } from 'lightningcss';
import sharp from 'sharp';
import { PUBLIC_DIR, ROOT, SITE_URL, UPLOADS_DIR } from '../server/config.js';
import { publishAllPages } from '../server/builder/pages.js';
import { publishAllProducts } from '../server/builder/product.js';
import { ensureStattiPosters } from '../server/routes/pages.js';

const DIST = path.join(ROOT, 'dist');
/** execFile як Promise: чекаємо завершення ffmpeg */
function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (err) => (err ? reject(err) : resolve()));
  });
}

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

// Головне фото товару (#ppMain) — найбільший елемент першого екрана (LCP). Якщо воно з сайту
// партнера, кладемо копію на наш сайт: так воно проходить WebP і srcset і не чекає чужого сервера.
// Галерея й решта фото лишаються за оригінальними адресами. У CMS посилання не змінюються.
const MAIN_PHOTO_RE = /<img\b[^>]*\bid="ppMain"[^>]*>/i;
const REMOTE_CACHE = path.join(ROOT, 'node_modules', '.cache', 'remote');
/** Копія у dist/ → файл у кеші (ключ кешу WebP замість оригіналу в img/) */
const remoteSources = new Map();

async function fetchRemote(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase() || '.jpg';
  const cached = path.join(REMOTE_CACHE, `${crypto.hash('sha1', url)}${ext}`);
  if (!fs.existsSync(cached)) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(`${cached}.tmp`, Buffer.from(await res.arrayBuffer()));
    fs.renameSync(`${cached}.tmp`, cached);
  }
  return cached;
}

/** https://sunny-tm.com/image/a b.jpg → img/remote/sunny-tm.com/image/a-b.jpg */
function remoteRef(url) {
  const { hostname, pathname } = new URL(url);
  const clean = decodeURIComponent(pathname).replace(/[^\w./-]+/g, '-').replace(/^\/+/, '');
  return `img/remote/${hostname}/${clean}`;
}

// Сторінки, де всі фото партнерів потрібні маленькими (картки) — кладемо на сайт усі
const LOCAL_PHOTO_PAGES = new Set(['catalog.html', 'index.html']);
const REMOTE_PHOTO_RE = /<img\b[^>]*\ssrc="(https?:\/\/[^"]+\.(?:jpe?g|png))"/gi;

/** Копія фото партнера в dist/ → шлях від кореня сайту */
async function localCopy(url) {
  const rel = remoteRef(url);
  if (!remoteSources.has(rel)) {
    remoteSources.set(rel, await fetchRemote(url));
    copyFile(remoteSources.get(rel), rel);
  }
  refs.add(rel);
  return rel;
}

fs.mkdirSync(REMOTE_CACHE, { recursive: true });
let mainLocal = 0;
let pageLocal = 0;
const remoteFailed = [];
for (const name of htmlFiles) {
  const file = path.join(DIST, name);
  let html = fs.readFileSync(file, 'utf8');
  const main = html.match(MAIN_PHOTO_RE)?.[0].match(/\ssrc="(https?:\/\/[^"]+\.(?:jpe?g|png))"/i)?.[1];
  const urls = LOCAL_PHOTO_PAGES.has(name) ? [...new Set([...html.matchAll(REMOTE_PHOTO_RE)].map((m) => m[1]))] : main ? [main] : [];
  for (const url of urls) {
    try {
      // Підміняємо всюди на сторінці: головне фото товару стоїть і першою мініатюрою
      html = html.replaceAll(`src="${url}"`, `src="${await localCopy(url)}"`);
      if (url === main) mainLocal += 1;
      else pageLocal += 1;
    } catch (err) {
      remoteFailed.push(`${name}: ${url} — ${err.message}`);
    }
  }
  if (urls.length) fs.writeFileSync(file, html, 'utf8');
}
console.log(`→ Фото партнерів на сайті: головних фото товарів ${mainLocal}, у картках каталогу й головної ${pageLocal}`);
for (const line of remoteFailed) console.warn(`! Не вдалося завантажити, лишилось зовнішнім: ${line}`);

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
// Ширини зменшених копій: плитки й картки (240), телефон (480, 800 — для екранів 2x), планшет (1200), великий екран (1600)
const SRCSET_WIDTHS = [240, 480, 800, 1200, 1600];
/** Повний WebP → усі його розміри від найменшого: [{ ref, w }] */
const responsive = new Map();

function webpName(ref) {
  return ref.replace(RASTER_RE, '.webp');
}

async function convertToWebp(rel) {
  const file = path.join(DIST, decodeURIComponent(rel));
  // Ключ кешу — оригінал у img/ чи uploads/: його дата зміни не скидається при кожній збірці
  const original = fs.statSync(remoteSources.get(rel) ?? sourceOf(rel));
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
  'product__img-wrap': '(min-width: 993px) 300px, (min-width: 600px) 30vw, (min-width: 380px) 40vw, calc(100vw - 44px)',
  cat__media: '(min-width: 993px) 400px, calc(100vw - 44px)',
  cat: '(min-width: 993px) 400px, calc(100vw - 44px)',
  'hero-photo': '(min-width: 1288px) 620px, (min-width: 781px) 50vw, calc(100vw - 44px)',
  'cat__media--grid': '(min-width: 993px) 200px, calc(50vw - 22px)',
  'video-card': '(min-width: 993px) 240px, calc(100vw - 44px)',
  'post-shot': '(min-width: 808px) 760px, 100vw',
  'pp-thumbs': '(min-width: 881px) 120px, 20vw',
  'post-video__facade': '(min-width: 808px) 760px, 100vw',
  'post-video__facade--ig': '(min-width: 460px) 420px, 100vw',
};
// Картинки, розмір яких задає їхній власний клас
const SIZES_BY_CLASS = {
  'pp-main-img': '(min-width: 881px) 620px, calc(100vw - 44px)',
};
const SIZES_DEFAULT = '(min-width: 1288px) 1240px, calc(100vw - 44px)';

/** Картки-розділи (.vendor-card) у сітці auto-fit minmax(300px): 2 картки — по ~610 px, 3+ — по ~400 px */
function vendorCardSizes(html) {
  const cards = (html.match(/class="vendor-card__media"/g) || []).length;
  return `(min-width: 993px) ${cards >= 3 ? 400 : cards === 2 ? 610 : 1240}px, calc(100vw - 44px)`;
}

function sizesFor(tag, before, html) {
  // Атрибут width — це ширина на екрані лише тоді, коли стиль її не перевизначає (width:100% тощо)
  const styleWidth = tag.match(/style="(?:[^"]*[;\s])?width:\s*([\d.]+)(px|%)/i);
  const fixed = styleWidth ? (styleWidth[2] === 'px' ? styleWidth : null) : tag.match(/\swidth="(\d+)"/i);
  if (fixed) return `${fixed[1]}px`;
  const own = tag.match(/\sclass="([^"]*)"/i)?.[1].split(/\s+/).find((cls) => SIZES_BY_CLASS[cls]);
  if (own) return SIZES_BY_CLASS[own];
  // Найближчий блок з класом; сусідні <img> з довгими srcset пропускаємо, щоб не «загубити» батька
  const parents = [...before.replace(/<img\b[^>]*>/gi, '').matchAll(/<[a-z][^>]*\bclass="([^"]*)"/gi)];
  const classes = parents.at(-1)?.[1].split(/\s+/) || [];
  if (classes.includes('vendor-card__media')) return vendorCardSizes(html);
  // Галерея статті: одне фото — на всю ширину, кілька — у дві колонки
  if (classes.includes('post-shot') && (html.match(/class="post-shot"/g) || []).length > 1) {
    return '(min-width: 808px) 380px, 50vw';
  }
  // Модифікатор (cat__media--grid) точніший за базовий клас, тож перевіряємо класи з кінця
  const parent = [...classes].reverse().find((cls) => SIZES_BY_PARENT[cls]);
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
    // sizes, прописаний у розмітці вручну, не чіпаємо — його автор знає верстку краще
    const sizes = /\ssizes=/i.test(tag) ? '' : ` sizes="${sizesFor(tag, html.slice(Math.max(0, offset - 3000), offset), html)}"`;
    return tag.replace(/\ssrc="[^"]*"/i, ` src="${set[0].ref}" srcset="${srcset}"${sizes}`);
  });
}

// Перші фото в <main> — зазвичай найбільший елемент першого екрана (LCP): вантажимо їх одразу,
// а найпершому даємо високий пріоритет. Решта лишається з loading="lazy".
const EAGER_IMAGES = 3;

function prioritizeFirstImages(html) {
  const main = html.search(/<main\b/i);
  if (main < 0) return html;
  let count = 0;
  // На сторінці товару перший екран — це одне головне фото; у сітках карток — кілька
  const limit = html.includes('id="ppMain"') ? 1 : EAGER_IMAGES;
  // Мініатюри під фото товару не конкурують за мережу з головним фото (LCP)
  const thumbs = [...html.slice(main).matchAll(/<div class="pp-thumbs">[\s\S]*?<\/div>/gi)].map((m) => [m.index, m.index + m[0].length]);
  const body = html.slice(main).replace(/<img\b[^>]*>/gi, (tag, offset) => {
    if (count >= limit || thumbs.some(([from, to]) => offset > from && offset < to)) return tag;
    count += 1;
    const eager = tag.replace(/\sloading="lazy"/i, '');
    return count === 1 && !/\sfetchpriority=/i.test(eager) ? eager.replace(/^<img\b/i, '<img fetchpriority="high"') : eager;
  });
  return html.slice(0, main) + body;
}

/** Перші фото з чужого сервера (SUNNY тощо): браузер з'єднується з ним заздалегідь, ще розбираючи HTML */
function preconnectImageHosts(html) {
  const main = html.search(/<main\b/i);
  if (main < 0) return html;
  const first = [...html.slice(main).matchAll(/<img\b[^>]*\ssrc="(https?:\/\/[^/"]+)/gi)].slice(0, EAGER_IMAGES);
  const hosts = [...new Set(first.map((m) => m[1]))].filter((host) => !html.includes(`rel="preconnect" href="${host}"`));
  if (!hosts.length) return html;
  return html.replace('</head>', `${hosts.map((host) => `<link rel="preconnect" href="${host}">`).join('\n')}\n</head>`);
}

for (const name of fs.readdirSync(path.join(DIST, 'assets')).filter((n) => n.endsWith('.css'))) {
  const file = path.join(DIST, 'assets', name);
  fs.writeFileSync(file, useWebp(fs.readFileSync(file, 'utf8'), 'assets'), 'utf8');
}

// Стилі вбудовуємо в кожну сторінку мініфікованими — без окремого запиту, що блокує відображення.
// Посилання з CSS рахувались від assets/, а зі сторінки — від кореня сайту.
const STYLESHEET_LINK = '<link rel="stylesheet" href="assets/style.css">';
const SCRIPT_TAG = '<script src="assets/script.js">';
const inlineCss = transform({
  filename: 'style.css',
  code: new TextEncoder().encode(fs.readFileSync(path.join(DIST, 'assets', 'style.css'), 'utf8')),
  minify: true,
})
  .code.toString()
  .replace(/url\((["']?)\.\.\//g, 'url($1');

for (const name of htmlFiles) {
  const file = path.join(DIST, name);
  const html = preconnectImageHosts(prioritizeFirstImages(useSrcset(useWebp(fs.readFileSync(file, 'utf8'), '.'))));
  // Скрипт лише додає інтерактивність (стартує на DOMContentLoaded) — сторінка не чекає на нього
  const ready = html.replace(STYLESHEET_LINK, `<style>${inlineCss}</style>`).replace(SCRIPT_TAG, '<script src="assets/script.js" defer>');
  fs.writeFileSync(file, ready, 'utf8');
}
const mb = (n) => (n / 1024 / 1024).toFixed(0);
console.log(`→ WebP: ${webps.size} з ${rasters.length} картинок, ${mb(webpBefore)} МБ → ${mb(webpAfter)} МБ`);
console.log(`→ srcset: зменшені копії для ${responsive.size} картинок, ще ${mb(srcsetBytes)} МБ`);
if (broken.length) {
  console.warn(`! Не вдалося перетворити на WebP — лишилися як є (${broken.length}):`);
  for (const line of broken.sort()) console.warn(`   ${line}`);
}

// Відео: H.264 MP4 лишається (його відтворюють усі айфони), але з розумним бітрейтом.
// Оригінали в img/ не змінюються, стиснені версії кешуються, як і WebP.
const VIDEO_CACHE = path.join(ROOT, 'node_modules', '.cache', 'video');
const VIDEO_ARGS = [
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-vf', "scale='min(1280,iw)':-2", '-fpsmax', '30',
  '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart',
];

fs.mkdirSync(VIDEO_CACHE, { recursive: true });
const videos = [...refs].filter((ref) => /^(?:img|uploads)\/.+\.mp4$/i.test(ref) && fs.existsSync(path.join(DIST, decodeURIComponent(ref))));
let videoBefore = 0;
let videoAfter = 0;
for (const rel of videos) {
  const file = path.join(DIST, decodeURIComponent(rel));
  const original = fs.statSync(sourceOf(rel));
  const cached = path.join(VIDEO_CACHE, `${crypto.hash('sha1', `${rel}:${original.size}:${original.mtimeMs}`)}.mp4`);
  if (!fs.existsSync(cached)) {
    try {
      await execFileAsync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', file, ...VIDEO_ARGS, `${cached}.tmp.mp4`]);
      fs.renameSync(`${cached}.tmp.mp4`, cached);
    } catch (err) {
      console.warn(`! Не вдалося стиснути ${rel}: ${err.message.split('\n')[0]}`);
      continue;
    }
  }
  const size = fs.statSync(cached).size;
  videoBefore += original.size;
  videoAfter += Math.min(size, original.size);
  if (size < original.size) fs.copyFileSync(cached, file);
}
console.log(`→ Відео: ${videos.length} файлів, ${mb(videoBefore)} МБ → ${mb(videoAfter)} МБ`);

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
