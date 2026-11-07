// Додає картку відгуку на сторінку vidhuky: копіює скріншот в img/reviews/ і вставляє картку в базу.
// Нові відгуки стають першими. Сайт після цього треба перезібрати: npm run build
//
//   node .claude/skills/add-review/add-review.mjs --image шлях.png --text "Текст" \
//     [--name Ім'я] [--city Дніпро] [--product "вікна REHAU"] [--blur x,y,ширина,висота] [--mask x,y,ширина,висота]
//
// --blur (можна кілька разів) розмиває область: аватарки, прізвища, телефони на копії.
// --mask (можна кілька разів) закриває область суцільним прямокутником.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { DATA_DIR, ROOT } from '../../../server/config.js';
import db from '../../../server/db.js';
import { esc } from '../../../server/html.js';

const { values: args } = parseArgs({
  options: {
    image: { type: 'string' },
    text: { type: 'string' },
    name: { type: 'string', default: '' },
    city: { type: 'string', default: '' },
    product: { type: 'string', default: '' },
    mask: { type: 'string', multiple: true, default: [] },
    blur: { type: 'string', multiple: true, default: [] },
  },
});

const IMAGE_DIR = path.join(ROOT, 'img', 'reviews');
const LIST_START = '<div class="reviews" id="reviews">\n';
const MASK_COLOR = '#cfd4da';
// Розмиття має бути таким, щоб літери й обличчя не вгадувались навіть на збільшеному скріні
const BLUR_SIGMA = 18;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function nextImageName(ext) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const numbers = fs.readdirSync(IMAGE_DIR).map((name) => Number(name.match(/^review-(\d+)\./)?.[1] ?? 0));
  const next = String(Math.max(0, ...numbers) + 1).padStart(3, '0');
  return `review-${next}${ext}`;
}

/** «x,y,ширина,висота» → область, обрізана по краях зображення */
function parseRegion(flag, value, meta) {
  const [left, top, width, height] = value.split(',').map(Number);
  if (![left, top, width, height].every(Number.isInteger) || width <= 0 || height <= 0) {
    fail(`--${flag} ${value}: потрібно x,y,ширина,висота в пікселях`);
  }
  const x = Math.max(0, left);
  const y = Math.max(0, top);
  const w = Math.min(width - (x - left), meta.width - x);
  const h = Math.min(height - (y - top), meta.height - y);
  if (w <= 0 || h <= 0) fail(`--${flag} ${value}: область поза зображенням`);
  return { left: x, top: y, width: w, height: h };
}

async function saveImage(from, to, meta) {
  const masks = args.mask.map((value) => {
    const { left, top, width, height } = parseRegion('mask', value, meta);
    return { input: { create: { width, height, channels: 3, background: MASK_COLOR } }, left, top };
  });
  const blurs = await Promise.all(
    args.blur.map(async (value) => {
      const region = parseRegion('blur', value, meta);
      const input = await sharp(from).extract(region).blur(BLUR_SIGMA).toBuffer();
      return { input, left: region.left, top: region.top };
    })
  );
  const overlays = [...blurs, ...masks];
  if (overlays.length) await sharp(from).composite(overlays).toFile(to);
  else fs.copyFileSync(from, to);
}

function cardHtml(src, { width, height }) {
  const paragraphs = args.text.trim().split(/\n+/).map(esc).join('<br>');
  const who = args.name.trim();
  const meta = [who && `<strong>${esc(who)}</strong>`, esc(args.city.trim()), esc(args.product.trim())].filter(Boolean);
  const alt = esc(['Скріншот відгуку клієнта', who, args.product.trim()].filter(Boolean).join(', '));
  return `<article class="review">
  <button type="button" class="review__shot"><img src="${src}" alt="${alt}" width="${width}" height="${height}" loading="lazy"></button>
  <div class="review__body">
    <blockquote class="review__text">${paragraphs}</blockquote>
${meta.length ? `    <p class="review__meta">${meta.join(' · ')}</p>\n` : ''}  </div>
</article>
`;
}

if (!args.image || !args.text?.trim()) fail('Потрібні --image і --text');
if (!fs.existsSync(args.image)) fail(`Немає файлу: ${args.image}`);
const ext = path.extname(args.image).toLowerCase().replace('.jpeg', '.jpg');
if (!['.jpg', '.png'].includes(ext)) fail(`Підтримуються JPG і PNG, отримано ${ext || 'файл без розширення'}`);

const page = db.prepare(`SELECT html FROM pages WHERE slug = 'vidhuky'`).get();
if (!page?.html.includes(LIST_START)) fail('У сторінці vidhuky немає списку відгуків');
if (page.html.includes(`>${args.text.trim().split(/\n+/).map(esc).join('<br>')}</blockquote>`)) {
  fail('Такий відгук уже є на сторінці');
}

const meta = await sharp(args.image).metadata();
const imageName = nextImageName(ext);
const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
const backup = path.join(DATA_DIR, `cms.backup-${stamp}-review.sqlite`);
if (!fs.existsSync(backup)) await db.backup(backup);

await saveImage(args.image, path.join(IMAGE_DIR, imageName), meta);
const card = cardHtml(`img/reviews/${imageName}`, meta);
db.prepare(`UPDATE pages SET html = ?, updated_at = datetime('now') WHERE slug = 'vidhuky'`).run(
  page.html.replace(LIST_START, () => LIST_START + card)
);
console.log(`✓ Додано: img/reviews/${imageName}\n${card}`);
