// Картинки для прев'ю в соцмережах у стилі головної (img/og-home.jpg):
// 1200×630, до трьох фото сторінки поруч і лого Корси на білій плашці по центру.
// Квадратне прев'ю Viber/WhatsApp бере центр — там якраз лого.
//
// Готові файли лежать в img/og/<сторінка>.jpg. Збірка створює лише відсутні;
// щоб перегенерувати — видаліть файл (або всю папку img/og/).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
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

/** Збирає прев'ю: фото смугами на всю висоту + лого по центру */
async function compose(photos, out) {
  const count = photos.length;
  const panel = Math.floor((OG_WIDTH - GAP * (count - 1)) / count);
  const panels = await Promise.all(
    photos.map(async (buf, i) => ({
      input: await sharp(buf).rotate().resize(panel, OG_HEIGHT, { fit: 'cover', position: 'attention' }).toBuffer(),
      left: i * (panel + GAP),
      top: 0,
    }))
  );
  const plate = await logoPlate();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp({ create: { width: OG_WIDTH, height: OG_HEIGHT, channels: 3, background: GAP_COLOR } })
    .composite([
      ...panels,
      { input: plate, left: (OG_WIDTH - PLATE.width) / 2, top: (OG_HEIGHT - PLATE.height) / 2 },
    ])
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(out);
}

/**
 * Створює відсутні прев'ю для сторінок з public/.
 * skip — сторінки з власною готовою картинкою (головна тощо).
 * Повертає { made, failed }: failed — сторінки без жодного придатного фото.
 */
export async function ensureOgImages(skip = []) {
  const made = [];
  const failed = [];
  const names = fs.readdirSync(PUBLIC_DIR).filter((name) => /^[a-z0-9-]+\.html$/.test(name) && !skip.includes(name));
  for (const name of names) {
    const out = path.join(ROOT, ogFile(name));
    if (fs.existsSync(out)) continue;
    const photos = await pickPhotos(fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8'));
    if (!photos.length) {
      failed.push(name);
      continue;
    }
    await compose(photos, out);
    made.push(name);
  }
  return { made, failed };
}
