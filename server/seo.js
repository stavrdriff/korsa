import { SITE_NAME, SITE_URL } from './config.js';
import { decode } from './html.js';

// Для пошуковиків і месенджерів: canonical, Open Graph і «хлібні крихти» (JSON-LD) на кожній сторінці.
// Там, де сторінка вже має свої теги (статті), не дублюємо.
const pageUrl = (name) => `${SITE_URL}/${name === 'index.html' ? '' : name}`;
const absolute = (ref) => (/^https?:\/\//i.test(ref) ? ref : `${SITE_URL}/${ref.replace(/^\/+/, '')}`);
const attr = (html, re) => html.match(re)?.[1] || '';

// Окрема картинка для прев'ю в месенджерах: JPG 1200×630, інакше береться перше фото сторінки
export const OG_IMAGES = { 'index.html': 'img/og-home.jpg' };

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

export function seoTags(name, html) {
  const tags = [];
  if (!/rel="canonical"/i.test(html)) tags.push(`<link rel="canonical" href="${pageUrl(name)}">`);
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
      `<meta property="og:image" content="${OG_IMAGES[name] ? absolute(OG_IMAGES[name]) : previewImage(html)}">`,
      `<meta name="twitter:card" content="summary_large_image">`
    );
  }
  if (!/"BreadcrumbList"/.test(html)) tags.push(breadcrumbJson(name, html));
  const block = tags.filter(Boolean).join('\n');
  return block ? html.replace('</head>', `${block}\n</head>`) : html;
}
