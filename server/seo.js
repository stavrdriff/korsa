import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE_NAME, SITE_URL } from './config.js';
import { decode } from './html.js';
import { OG_HEIGHT, OG_WIDTH, ogFile } from './og-image.js';

// Для пошуковиків і месенджерів: canonical, Open Graph і «хлібні крихти» (JSON-LD) на кожній сторінці.
// Там, де сторінка вже має свої теги (статті), не дублюємо.
const pageUrl = (name) => `${SITE_URL}/${name === 'index.html' ? '' : name}`;
const absolute = (ref) => (/^https?:\/\//i.test(ref) ? ref : `${SITE_URL}/${ref.replace(/^\/+/, '')}`);
const attr = (html, re) => html.match(re)?.[1] || '';

// Готові картинки для прев'ю (JPG 1200×630). Решта сторінок — img/og/<сторінка>.jpg (server/og-image.js),
// а якщо її ще немає — перше фото сторінки
export const OG_IMAGES = { 'index.html': 'img/og-home.jpg', 'vidhuky.html': 'img/og-home.jpg', 'contacts.html': 'img/og-home.jpg' };

/** Картинка прев'ю 1200×630 для сторінки, якщо вона є */
export function ogImageFor(name) {
  if (OG_IMAGES[name]) return OG_IMAGES[name];
  const file = ogFile(name);
  return fs.existsSync(path.join(ROOT, file)) ? file : '';
}

/** Розмір наперед — Facebook і LinkedIn тоді показують велике прев'ю вже з першого поширення */
const ogSizeTags = () => [
  `<meta property="og:image:type" content="image/jpeg">`,
  `<meta property="og:image:width" content="${OG_WIDTH}">`,
  `<meta property="og:image:height" content="${OG_HEIGHT}">`,
];

/** Картинка для прев'ю: перше фото сторінки в JPG/PNG (WebP показують не всі месенджери), інакше лого */
function previewImage(html) {
  const main = html.slice(Math.max(0, html.search(/<main\b/i)));
  const src = [...main.matchAll(/<img\b[^>]*\ssrc="([^"]+\.(?:jpe?g|png))"/gi)].map((m) => m[1])[0];
  return absolute(src || 'img/logo.jpg');
}

function breadcrumbJson(name, html) {
  const crumb = html.match(/<div class="crumb">([\s\S]*?)<\/div>/i)?.[1];
  if (!crumb) return '';
  const items = [...crumb.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
    name: decode(m[2].replace(/<[^>]+>/g, '')).trim(),
    item: pageUrl(m[1].replace(/^\/+/, '') || 'index.html'),
  }));
  const current = decode(crumb.replace(/[\s\S]*<\/a>/i, '').replace(/<[^>]+>/g, '')).replace(/^[\s/]+/, '').trim();
  if (current) items.push({ name: current, item: pageUrl(name) });
  if (items.length < 2) return '';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.item })),
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/** FAQPage з видимого блоку питань: <details class="faq__item"><summary>питання</summary><div class="faq__a">відповідь</div></details> */
function faqJson(html) {
  const text = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const items = [...html.matchAll(/<details class="faq__item">\s*<summary>([\s\S]*?)<\/summary>\s*<div class="faq__a">([\s\S]*?)<\/div>\s*<\/details>/gi)];
  if (!items.length) return '';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((m) => ({
      '@type': 'Question',
      name: text(m[1]),
      acceptedAnswer: { '@type': 'Answer', text: text(m[2]) },
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

export function seoTags(name, source) {
  let html = source;
  const tags = [];
  const ogImage = ogImageFor(name);
  if (!/rel="canonical"/i.test(html)) tags.push(`<link rel="canonical" href="${pageUrl(name)}">`);
  if (/property="og:title"/i.test(html) && ogImage) {
    // Сторінка має свої теги (статті, список статей) — міняємо лише картинку
    html = html.replace(
      /<meta property="og:image" content="[^"]*">/i,
      `<meta property="og:image" content="${absolute(ogImage)}">\n${ogSizeTags().join('\n')}`
    );
  }
  if (!/property="og:title"/i.test(html)) {
    const title = attr(html, /<title>([\s\S]*?)<\/title>/i).trim();
    const description = attr(html, /<meta name="description" content="([^"]*)"/i);
    tags.push(
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${SITE_NAME}">`,
      `<meta property="og:locale" content="uk_UA">`,
      `<meta property="og:title" content="${title}">`,
      ...(description ? [`<meta property="og:description" content="${description}">`] : []),
      `<meta property="og:url" content="${pageUrl(name)}">`,
      `<meta property="og:image" content="${ogImage ? absolute(ogImage) : previewImage(html)}">`,
      ...(ogImage ? [...ogSizeTags(), `<meta property="og:image:alt" content="${title}">`] : []),
      `<meta name="twitter:card" content="summary_large_image">`
    );
  }
  if (!/"BreadcrumbList"/.test(html)) tags.push(breadcrumbJson(name, html));
  if (!/"FAQPage"/.test(html)) tags.push(faqJson(html));
  const block = tags.filter(Boolean).join('\n');
  return block ? html.replace('</head>', `${block}\n</head>`) : html;
}
