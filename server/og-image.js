// Картинки для прев'ю в соцмережах у стилі головної (img/og-home.jpg):
// 1200×630, до трьох фото сторінки поруч і лого Корси на білій плашці по центру.
// Квадратне прев'ю Viber/WhatsApp бере центр — там якраз лого.
//
// Готові файли лежать в img/og/<сторінка>.jpg. Збірка створює лише відсутні;
// щоб перегенерувати — видаліть файл (або всю папку img/og/).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import db from './db.js';
import { PUBLIC_DIR, ROOT, UPLOADS_DIR } from './config.js';

export const OG_DIR = path.join(ROOT, 'img', 'og');
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const GAP = 4;
const GAP_COLOR = '#e9e6df';
const PLATE = { width: 660, height: 216, radius: 22 };
const LOGO_WIDTH = 560;
/** Менші фото — це іконки, зразки тканин тощо: для прев'ю не годяться */
const MIN_SIDE = 300;
const MAX_PHOTOS = 3;
// Вузькі вертикальні фото (двері 185×400): беремо до п'яти — смуги вужчі, фото майже не розтягується
const NARROW_RATIO = 0.6;
const NARROW_MIN = { width: 160, height: 380 };
const MAX_NARROW = 5;
const FETCH_TIMEOUT = 15000;

// Фото, вибрані для прев'ю в адмінці (поле «Фото для прев'ю» у статті), — page_items.og_photos.
// Що з чого зібрано, пам'ятає img/og/sources.json: змінили фото — прев'ю перегенерується.
const SOURCES_FILE = path.join(OG_DIR, 'sources.json');
export const OG_MAX_CHOSEN = MAX_PHOTOS;

/** Файл прев'ю для сторінки (відносно кореня сайту) */
export const ogFile = (name) => `img/og/${name.replace(/\.html$/, '')}.jpg`;

/** Адреси фото лише з <main> (у футері — лого), спершу ті, що на сторінці вище */
function photoRefs(html) {
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || '';
  const refs = [...main.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/gi)].map((m) => m[1]);
  return [...new Set(refs)].filter(
    // Мініатюри YouTube мають чорні смуги, лого на прев'ю вже є
    (ref) => /\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(ref) && !/youtube\.com|ytimg\.com|\blogo\b/i.test(ref)
  );
}

async function loadPhoto(ref) {
  try {
    if (/^https?:\/\//i.test(ref)) {
      const res = await fetch(ref, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    const clean = decodeURIComponent(ref.replace(/^\/+/, '').split(/[?#]/)[0]);
    const file = clean.startsWith('uploads/') ? path.join(UPLOADS_DIR, clean.slice(8)) : path.join(ROOT, clean);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

async function pickPhotos(html) {
  const photos = [];
  const narrow = [];
  for (const ref of photoRefs(html)) {
    if (photos.length >= MAX_PHOTOS || narrow.length >= MAX_NARROW) break;
    const buf = await loadPhoto(ref);
    if (!buf) continue;
    try {
      const { width = 0, height = 0 } = await sharp(buf).metadata();
      if (Math.min(width, height) >= MIN_SIDE) photos.push(buf);
      else if (width / height < NARROW_RATIO && width >= NARROW_MIN.width && height >= NARROW_MIN.height) narrow.push(buf);
    } catch {
      // не картинка або битий файл — пропускаємо
    }
  }
  return photos.length ? photos : narrow;
}

async function logoPlate() {
  const logo = await sharp(path.join(ROOT, 'img', 'logo.jpg'))
    .resize({ width: LOGO_WIDTH })
    .normalise({ lower: 0, upper: 85 })
    .toBuffer();
  const { height: logoHeight } = await sharp(logo).metadata();
  const { width, height, radius } = PLATE;
  const mask = Buffer.from(`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`);
  return sharp({ create: { width, height, channels: 4, background: '#ffffff' } })
    .composite([
      { input: logo, left: Math.round((width - LOGO_WIDTH) / 2), top: Math.round((height - logoHeight) / 2) },
      { input: mask, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

/** Фото смугами на всю висоту (JPEG) */
async function composeStrips(photos, { width, height, position, overlay }) {
  const count = photos.length;
  const panel = Math.floor((width - GAP * (count - 1)) / count);
  const panels = await Promise.all(
    photos.map(async (buf, i) => ({
      input: await sharp(buf)
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(i === count - 1 ? width - i * (panel + GAP) : panel, height, { fit: 'cover', position })
        .toBuffer(),
      left: i * (panel + GAP),
      top: 0,
    }))
  );
  return sharp({ create: { width, height, channels: 3, background: GAP_COLOR } })
    .composite([...panels, ...(overlay ? [overlay] : [])])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
}

/**
 * Збирає прев'ю 1200×630 (JPEG): фото смугами на всю висоту + лого по центру.
 * position — як sharp обрізає фото під смугу: 'attention' шукає найцікавіше, 'centre' — середина.
 */
export async function composeOgImage(photos, position = 'attention') {
  const plate = await logoPlate();
  return composeStrips(photos, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    position,
    overlay: { input: plate, left: (OG_WIDTH - PLATE.width) / 2, top: (OG_HEIGHT - PLATE.height) / 2 },
  });
}

/** Вибрані фото → придатні картинки (биті й недоступні пропускаємо) */
export async function loadChosenPhotos(refs) {
  const bufs = await Promise.all(refs.slice(0, OG_MAX_CHOSEN).map(loadPhoto));
  const ok = [];
  for (const buf of bufs) {
    if (!buf) continue;
    try {
      await sharp(buf).metadata();
      ok.push(buf);
    } catch {
      // не картинка
    }
  }
  return ok;
}

/** Фото, вибрані в адмінці для статей: { slug: [адреси] } */
function chosenPhotos() {
  const rows = db.prepare(`SELECT slug, og_photos FROM page_items WHERE kind = 'post' AND slug != ''`).all();
  const map = {};
  for (const row of rows) {
    try {
      const list = JSON.parse(row.og_photos || '[]');
      if (Array.isArray(list) && list.length) map[row.slug] = list.map(String).filter(Boolean);
    } catch {
      // порожнє або зіпсоване поле — як не вибрано
    }
  }
  return map;
}

function readSources(file = SOURCES_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Створює прев'ю для сторінок з public/: відсутні, а також ті, де в адмінці змінили вибрані фото.
 * skip — сторінки з власною готовою картинкою (головна тощо).
 * Повертає { made, failed }: failed — сторінки без жодного придатного фото.
 */
export async function ensureOgImages(skip = []) {
  const made = [];
  const failed = [];
  const chosen = chosenPhotos();
  const sources = readSources();
  const names = fs.readdirSync(PUBLIC_DIR).filter((name) => /^[a-z0-9-]+\.html$/.test(name) && !skip.includes(name));
  for (const name of names) {
    const key = name.replace(/\.html$/, '');
    const out = path.join(ROOT, ogFile(name));
    // Підпис джерела: список вибраних фото або «auto» — фото зі сторінки
    const signature = chosen[key] ? chosen[key].join('\n') : 'auto';
    if (fs.existsSync(out) && (sources[key] || 'auto') === signature) continue;
    const photos = chosen[key]
      ? await loadChosenPhotos(chosen[key])
      : await pickPhotos(fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8'));
    if (!photos.length) {
      failed.push(name);
      continue;
    }
    fs.mkdirSync(OG_DIR, { recursive: true });
    // Вибрані вручну фото обрізаємо по центру — людина вже обрала, що показати
    fs.writeFileSync(out, await composeOgImage(photos, chosen[key] ? 'centre' : 'attention'));
    if (signature === 'auto') delete sources[key];
    else sources[key] = signature;
    made.push(name);
  }
  fs.writeFileSync(SOURCES_FILE, `${JSON.stringify(sources, null, 2)}\n`);
  return { made, failed };
}

// Картинки карток у списку статей: ті самі вибрані фото смугами, але без лого.
// Пропорція — як у .cat__media (16:10), удвічі більше за картку для чітких екранів.
export const CARDS_DIR = path.join(ROOT, 'img', 'cards');
const CARD = { width: 800, height: 500 };
const CARD_SOURCES = path.join(CARDS_DIR, 'sources.json');
const cardFile = (slug) => `img/cards/${slug}.jpg`;

/** Картинка картки статті, якщо для неї вибрані фото й файл уже зібраний */
export function cardImageFor(item) {
  const chosen = Array.isArray(item?.og_photos) ? item.og_photos : [];
  if (!item?.slug || !chosen.length) return '';
  const file = cardFile(item.slug);
  return fs.existsSync(path.join(ROOT, file)) ? file : '';
}

/** Збирає картинки карток для статей з вибраними фото: нові й ті, де фото змінили */
export async function ensureCardImages(items = []) {
  const sources = readSources(CARD_SOURCES);
  let changed = false;
  for (const item of items) {
    const chosen = Array.isArray(item?.og_photos) ? item.og_photos.slice(0, OG_MAX_CHOSEN) : [];
    if (item?.kind !== 'post' || !item.slug || !chosen.length) continue;
    const out = path.join(ROOT, cardFile(item.slug));
    const signature = chosen.join('\n');
    if (fs.existsSync(out) && sources[item.slug] === signature) continue;
    const photos = await loadChosenPhotos(chosen);
    if (!photos.length) continue;
    fs.mkdirSync(CARDS_DIR, { recursive: true });
    fs.writeFileSync(out, await composeStrips(photos, { ...CARD, position: 'centre' }));
    sources[item.slug] = signature;
    changed = true;
  }
  if (changed) fs.writeFileSync(CARD_SOURCES, `${JSON.stringify(sources, null, 2)}\n`);
}
