import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { PUBLIC_DIR, SITE_URL, UPLOADS_DIR } from '../config.js';
import { writePage, writeSitemap } from '../sitemap.js';
import { decode, esc, stripScripts } from '../html.js';

const router = Router();

function loadItems(pageId) {
  return db
    .prepare(
      `SELECT id, kind, group_label, title, description, href, image, price, sort_order, published, created_at, body, slug, photos, videos
       FROM page_items WHERE page_id = ? ORDER BY sort_order, id`
    )
    .all(pageId)
    .map((row) => ({
      ...row,
      photos: postPhotos(row),
      videos: postVideos(row),
    }));
}

function loadPage(id) {
  const page = db
    .prepare(
      `SELECT id, slug, title, kind, eyebrow, lead, parent_link, parent_label, meta_title, meta_description, published
       FROM pages WHERE id = ?`
    )
    .get(id);
  if (!page) return null;
  page.items = loadItems(page.id);
  page.gallery = page.items.filter((item) => item.kind === 'gallery').length;
  return page;
}

function youtubeId(href) {
  const match = String(href).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/i);
  return match ? match[1] : '';
}

function youtubePoster(href) {
  const id = youtubeId(href);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '';
}

function instagramCode(href) {
  const match = String(href).match(/instagram\.com\/(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : '';
}

function instagramEmbed(href) {
  const code = instagramCode(href);
  if (!code) return '';
  const kind = /\/reels?\//i.test(href) ? 'reel' : /\/tv\//i.test(href) ? 'tv' : 'p';
  return `https://www.instagram.com/${kind}/${code}/embed`;
}

function instagramPosterFile(code) {
  return `ig-${code}.jpg`;
}

/** Прев'ю Instagram — локальна копія, яку заздалегідь скачав ensureInstagramPosters */
function instagramPoster(href) {
  const code = instagramCode(href);
  if (!code || !fs.existsSync(path.join(UPLOADS_DIR, instagramPosterFile(code)))) return '';
  return `/uploads/${instagramPosterFile(code)}`;
}

function videoPoster(href) {
  return youtubePoster(href) || instagramPoster(href);
}

async function downloadInstagramPoster(code) {
  const headers = { 'User-Agent': 'Mozilla/5.0' };
  const page = await fetch(`https://www.instagram.com/p/${code}/`, { headers, signal: AbortSignal.timeout(10000) });
  if (!page.ok) return;
  const match = (await page.text()).match(/<meta property="og:image" content="([^"]+)"/);
  if (!match) return;
  const image = await fetch(decode(match[1]), { headers, signal: AbortSignal.timeout(15000) });
  if (!image.ok || !String(image.headers.get('content-type')).startsWith('image/')) return;
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, instagramPosterFile(code)), Buffer.from(await image.arrayBuffer()));
}

/**
 * Скачати прев'ю для Instagram-відео в постах без фото. Посилання на картинку з og:image
 * підписане і з часом протухає, тому зберігаємо файл у uploads. Помилки не зупиняють збереження.
 */
export async function ensureInstagramPosters(items) {
  const codes = new Set();
  for (const item of items || []) {
    if (item.kind !== 'post' || coverPhoto(item)) continue;
    const code = instagramCode(postVideos(item)[0] || '');
    if (code && !instagramPoster(postVideos(item)[0])) codes.add(code);
  }
  await Promise.all(
    [...codes].map((code) =>
      downloadInstagramPoster(code).catch((e) => console.warn(`Прев'ю Instagram ${code}:`, e.message))
    )
  );
}

function videoPlayer(url, title) {
  const name = esc(title || 'Відео');
  const youtube = youtubeId(url);
  if (youtube) {
    return `<div class="post-video"><iframe src="https://www.youtube.com/embed/${esc(youtube)}" title="${name}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  const instagram = instagramEmbed(url);
  if (!instagram) return '';
  return `<div class="post-video post-video--ig"><iframe src="${esc(instagram)}" title="${name}" allowfullscreen></iframe></div>`;
}

function explicitList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
  } catch {
    return null;
  }
  return null;
}

function postPhotos(item) {
  const list = explicitList(item?.photos);
  if (list) return list;
  const image = String(item?.image || '').trim();
  return image ? [image] : [];
}

function coverPhoto(item) {
  const photos = postPhotos(item);
  const chosen = String(item?.image || '').trim();
  if (chosen && photos.includes(chosen)) return chosen;
  return photos[0] || '';
}

function orderedPhotos(item) {
  const photos = postPhotos(item);
  const cover = coverPhoto(item);
  if (!cover) return photos;
  return [cover, ...photos.filter((src) => src !== cover)];
}

function postVideos(item) {
  const list = explicitList(item?.videos);
  if (list) return list;
  const href = String(item?.href || '').trim();
  return href ? [href] : [];
}

const CYR = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ye', 'ж': 'zh', 'з': 'z',
  'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
  'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ь': '', 'ю': 'yu', 'я': 'ya', 'ы': 'y', 'э': 'e', 'ъ': '', 'ё': 'yo',
};

// Службові слова, які не несуть змісту в адресі статті
const SLUG_STOP_WORDS = new Set(
  `і й та а але чи або що як який яка яке які це ще не ні же б би в у на з із зі до за від для при по про
   через над під між без чому навіщо коли де саме ваш ваша ваше ваші вашого вашої вас вам ми ви ви він вона
   воно вони його її їх свій своє своїх можна треба дізнайтеся хочете`.split(/\s+/)
);
const SLUG_MAX_WORDS = 4;
const SLUG_MAX_LENGTH = 40;

/** Коротка адреса статті: перше речення заголовка, 2–4 змістовні слова, до 40 символів */
function makeSlug(title, used) {
  const sentence = String(title || '').toLowerCase().split(/[.?!:;]/)[0];
  const words = sentence
    .split(/[^a-zа-яіїєґ0-9']+/)
    .filter((word) => word && !SLUG_STOP_WORDS.has(word))
    .map((word) => [...word].map((ch) => CYR[ch] ?? ch).join('').replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  let base = '';
  for (const word of words.slice(0, SLUG_MAX_WORDS)) {
    const next = base ? `${base}-${word}` : word;
    if (base && next.length > SLUG_MAX_LENGTH) break;
    base = next.slice(0, SLUG_MAX_LENGTH);
  }
  base ||= 'material';
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

function assignPostSlugs(items, prevById) {
  const used = new Set();
  return (items || []).map((item) => {
    if (item.kind !== 'post') return item;
    const prev = prevById.get(Number(item.id));
    let slug = /^[a-z0-9-]+$/.test(prev?.slug || '') ? prev.slug : '';
    if (!slug && /^[a-z0-9-]+$/.test(item.slug || '') && !used.has(item.slug)) slug = item.slug;
    if (slug && used.has(slug)) slug = '';
    if (!slug) slug = makeSlug(item.title, used);
    else used.add(slug);
    return { ...item, slug };
  });
}

function articleFile(slug) {
  return `stattia-${slug}.html`;
}

function textToParagraphs(text) {
  return String(text || '')
    .trim()
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${esc(part).replaceAll('\n', '<br>')}</p>`)
    .join('\n');
}

function articleHtml(body) {
  const raw = String(body || '').trim();
  if (!raw) return '';
  const safe = stripScripts(raw);
  if (!/<[a-z][\s\S]*>/i.test(safe)) return textToParagraphs(safe);
  return safe;
}

function cardExcerpt(item) {
  const short = String(item.description || '').trim();
  if (short) return short;
  const plain = String(item.body || '').replace(/\s+/g, ' ').trim();
  if (plain.length <= 180) return plain;
  return `${plain.slice(0, 177).trim()}…`;
}

/** og:image та og:url мають бути абсолютними: «/uploads/a.jpg» → «https://сайт/uploads/a.jpg» */
function absoluteUrl(ref) {
  const value = String(ref || '').trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  return `${SITE_URL}/${value.replace(/^\/+/, '')}`;
}

/** Основна картинка матеріалу: обкладинка, а для відео без фото — прев'ю з YouTube чи Instagram */
function postImage(item) {
  const videos = postVideos(item);
  return absoluteUrl(coverPhoto(item) || (videos[0] ? videoPoster(videos[0]) : ''));
}

function metaTags(tags) {
  return tags
    .filter(Boolean)
    .map(([attr, key, value]) => `<meta ${attr}="${key}" content="${esc(value)}">`)
    .join('\n');
}

function openGraphTags(item, lead) {
  const image = postImage(item);
  const day = String(item.created_at || '').slice(0, 10);
  return metaTags([
    ['property', 'og:type', 'article'],
    ['property', 'og:site_name', 'Корса'],
    ['property', 'og:locale', 'uk_UA'],
    ['property', 'og:title', item.title || 'Стаття'],
    ['property', 'og:description', lead],
    ['property', 'og:url', absoluteUrl(articleFile(item.slug))],
    image && ['property', 'og:image', image],
    image && ['property', 'og:image:alt', item.title || ''],
    /^\d{4}-\d{2}-\d{2}$/.test(day) && ['property', 'article:published_time', day],
    ['name', 'twitter:card', image ? 'summary_large_image' : 'summary'],
  ]);
}

/** OpenGraph для statti.html: заголовок і опис беремо зі сторінки, картинку — з найновішого матеріалу */
function withStattiOpenGraph(html, items) {
  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  const desc = decode((html.match(/<meta name="description" content="([^"]*)"/i) || [])[1] || '');
  const latest = (items || [])
    .filter((item) => item.kind === 'post' && Number(item.published ?? 1))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const image = latest.map(postImage).find(Boolean) || '';
  const url = absoluteUrl('statti.html');
  const block = `<!-- og:start -->
<link rel="canonical" href="${esc(url)}">
${metaTags([
  ['property', 'og:type', 'website'],
  ['property', 'og:site_name', 'Корса'],
  ['property', 'og:locale', 'uk_UA'],
  ['property', 'og:title', title],
  ['property', 'og:description', desc],
  ['property', 'og:url', url],
  image && ['property', 'og:image', image],
  ['name', 'twitter:card', image ? 'summary_large_image' : 'summary'],
])}
<!-- og:end -->`;
  if (/<!-- og:start -->[\s\S]*?<!-- og:end -->/.test(html)) {
    return html.replace(/<!-- og:start -->[\s\S]*?<!-- og:end -->/, () => block);
  }
  return html.replace('</head>', () => `${block}\n</head>`);
}

function renderArticlePage(shell, item) {
  const header = (shell.match(/<header[\s\S]*?<\/header>/) || [''])[0];
  const footer = (shell.match(/<footer[\s\S]*?<\/footer>/) || [''])[0];
  const photos = orderedPhotos(item);
  const videos = postVideos(item);
  const added = postDateLabel(item.created_at);
  const body = articleHtml(item.body);
  const lead = cardExcerpt(item);
  const gallery = photos
    .map((src) => `<button type="button" class="post-shot"><img src="${esc(src)}" alt="${esc(item.title || '')}"></button>`)
    .join('\n');
  const players = videos
    .map((url) => videoPlayer(url, item.title))
    .filter(Boolean)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(item.title || 'Стаття')} | Корса</title>
<meta name="description" content="${esc(lead)}">
<link rel="canonical" href="${esc(absoluteUrl(articleFile(item.slug)))}">
${openGraphTags(item, lead)}
<link rel="stylesheet" href="assets/style.css">
</head>
<body class="has-photo-bg bg-pano">
${header}
<section class="section--blueprint section--photo-bg bg--pano">
  <div class="section__inner post-read">
    <div class="crumb"><a href="index.html">Головна</a> / <a href="statti.html">Корисні статті та відео</a> / ${esc(item.title || 'Стаття')}</div>
    <h1>${esc(item.title || '')}</h1>
    ${added ? `<p class="post-date"><time datetime="${esc(String(item.created_at).slice(0, 10))}">${esc(added)}</time></p>` : ''}
    <article>
      ${gallery ? `<div class="post-gallery">\n${gallery}\n</div>` : ''}
      ${body ? `<div class="post-html">${body}</div>` : ''}
      ${players}
    </article>
  </div>
</section>
${footer}
<script src="assets/script.js"></script>
</body>
</html>
`;
}

function writeArticlePages(shell, items) {
  const posts = (items || []).filter((item) => item.kind === 'post' && item.slug);
  const keep = new Set();
  for (const item of posts) {
    const name = articleFile(item.slug);
    if (!Number(item.published ?? 1)) continue;
    keep.add(name);
    writePage(path.join(PUBLIC_DIR, name), renderArticlePage(shell, item));
  }
  for (const name of fs.readdirSync(PUBLIC_DIR)) {
    if (/^stattia-[a-z0-9-]+\.html$/.test(name) && !keep.has(name)) {
      fs.unlinkSync(path.join(PUBLIC_DIR, name));
    }
  }
  writeSitemap();
}

function localStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function postDateLabel(stamp) {
  const match = String(stamp || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

function withPostDates(items, prevById) {
  return (items || []).map((item) => {
    if (item.kind !== 'post') return item;
    const prev = prevById.get(Number(item.id));
    const kept = prev?.created_at || '';
    const incoming = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(item.created_at || '') ? item.created_at : '';
    return { ...item, created_at: kept || incoming || localStamp() };
  });
}

function renderStattiPosts(html, items) {
  const cards = (items || [])
    .filter((item) => item.kind === 'post' && Number(item.published ?? 1) && (item.title || item.href))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map((item) => {
      const videos = postVideos(item);
      const image = coverPhoto(item) || (videos[0] ? videoPoster(videos[0]) : '');
      const label = item.group_label === 'video' || videos.length ? 'Відео' : 'Стаття';
      const media = image
        ? `<img src="${esc(image)}" alt="${esc(item.title || '')}">`
        : '';
      const added = postDateLabel(item.created_at);
      const when = added
        ? `<time datetime="${esc(item.created_at.slice(0, 10))}">${esc(added)}</time>`
        : '';
      const href = item.slug ? articleFile(item.slug) : 'statti.html';
      return `<article>
    <a class="cat" href="${esc(href)}">
      <div class="cat__media">${media}</div>
      <div class="cat__body">
        <h3>${esc(item.title || '')}</h3>
        <p>${esc(cardExcerpt(item))}</p>
        <div class="cat__meta"><span>${when}${when ? ' · ' : ''}${label}</span><span class="cat__arrow">→</span></div>
      </div>
    </a>
  </article>`;
    })
    .join('\n');
  const block = `<div class="cats" id="posts" style="margin-top:28px">\n${cards}\n</div>`;
  const start = '<!-- posts:start -->';
  const end = '<!-- posts:end -->';
  if (html.includes(start) && html.includes(end)) {
    return html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${block}\n${end}`);
  }
  const anchor = '</div>\n</section>';
  if (html.includes(anchor)) {
    return html.replace(anchor, `${start}\n${block}\n${end}\n  </div>\n</section>`);
  }
  return html.replace('</section>', `${start}\n${block}\n${end}\n</section>`);
}

function patchHtml(html, prev, next) {
  let out = html || '';
  if (next.meta_title && next.meta_title !== prev.meta_title) {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(next.meta_title)}</title>`);
  }
  if (next.meta_description != null && next.meta_description !== prev.meta_description) {
    if (/<meta name="description" content="/i.test(out)) {
      out = out.replace(
        /(<meta name="description" content=")[^"]*(")/i,
        `$1${esc(next.meta_description)}$2`
      );
    }
  }
  if (next.title && next.title !== prev.title) {
    // На головній H1 — це гасло в hero, а назва сторінки стоїть у першому H2
    const tag = prev.slug === 'index' ? 'h2' : 'h1';
    out = out.replace(new RegExp(`(<${tag}[^>]*>)[\\s\\S]*?(</${tag}>)`, 'i'), `$1${esc(next.title)}$2`);
  }
  if (next.eyebrow != null && next.eyebrow !== prev.eyebrow && next.eyebrow !== '') {
    out = out.replace(/(<span class="eyebrow">)[\s\S]*?(<\/span>)/i, `$1${esc(next.eyebrow)}$2`);
  }
  if (next.lead != null && next.lead !== prev.lead) {
    out = out.replace(/(<p class="section__lead">)[\s\S]*?(<\/p>)/i, `$1${esc(next.lead)}$2`);
  }
  return out;
}

function replaceUnique(html, from, to) {
  if (!from || from === to) return html;
  const parts = html.split(from);
  if (parts.length !== 2) return html;
  return parts.join(to);
}

/** Докачати прев'ю Instagram для збережених статей (перед publishArticlePages) */
export async function ensureStattiPosters() {
  const page = db.prepare(`SELECT id FROM pages WHERE slug = 'statti'`).get();
  if (page) await ensureInstagramPosters(loadItems(page.id));
}

/** Перегенерувати статті та statti.html з бази (для збірки — щоб OpenGraph потрапив і в уже створені) */
export function publishArticlePages() {
  const page = db.prepare(`SELECT id, html FROM pages WHERE slug = 'statti'`).get();
  if (!page?.html) return 0;
  const items = loadItems(page.id);
  const html = withStattiOpenGraph(renderStattiPosts(page.html, items), items);
  if (html !== page.html) db.prepare(`UPDATE pages SET html = ? WHERE id = ?`).run(html, page.id);
  writePage(path.join(PUBLIC_DIR, 'statti.html'), html);
  writeArticlePages(html, items);
  return items.filter((item) => item.kind === 'post' && item.slug && Number(item.published ?? 1)).length;
}

router.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.slug, p.title, p.kind, p.eyebrow, p.lead, p.parent_link, p.parent_label,
              p.meta_title, p.published,
              COALESCE(i.cards, 0) AS cards,
              COALESCE(i.models, 0) AS models,
              COALESCE(i.gallery, 0) AS gallery
       FROM pages p
       LEFT JOIN (
         SELECT page_id,
                SUM(kind = 'card') AS cards,
                SUM(kind = 'model') AS models,
                SUM(kind = 'gallery') AS gallery
         FROM page_items
         GROUP BY page_id
       ) i ON i.page_id = p.id
       ORDER BY p.sort_order, p.title`
    )
    .all();
  res.json(rows);
});

/** Список опублікованих сторінок сайту — для вставки внутрішніх посилань у текст статті */
router.get('/links', (_req, res) => {
  // Батьківська сторінка й порядок беремо з CMS, щоб адмінка показала список деревом
  const meta = new Map();
  const rows = [
    ...db.prepare('SELECT slug, parent_link, sort_order FROM pages').all(),
    ...db.prepare('SELECT slug, parent_link, sort_order FROM products').all(),
  ];
  for (const row of rows) {
    meta.set(`${row.slug}.html`, { parent: row.parent_link || '', order: row.sort_order || 0 });
  }
  const links = fs
    .readdirSync(PUBLIC_DIR)
    .filter((name) => name.endsWith('.html'))
    .map((name) => {
      const html = fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8');
      const raw = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '';
      const title = decode(raw).replace(/\s*\|\s*Корса\s*$/i, '').trim() || name;
      const known = meta.get(name);
      const parent = known?.parent || (name.startsWith('stattia-') ? 'statti.html' : name === 'index.html' ? '' : 'index.html');
      return { href: name, title, parent, order: known?.order ?? 0 };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'uk'));
  res.json(links);
});

router.get('/:id', (req, res) => {
  const page = loadPage(Number(req.params.id));
  if (!page) return res.status(404).json({ error: 'Not found' });
  res.json(page);
});

router.put('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM pages WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  if (existing.slug === 'statti' && Array.isArray(b.items)) await ensureInstagramPosters(b.items);
  const next = {
    title: b.title ?? existing.title,
    eyebrow: b.eyebrow ?? existing.eyebrow,
    lead: b.lead ?? existing.lead,
    parent_link: b.parent_link ?? existing.parent_link,
    parent_label: b.parent_label ?? existing.parent_label,
    meta_title: b.meta_title ?? existing.meta_title,
    meta_description: b.meta_description ?? existing.meta_description,
  };

  const save = db.transaction(() => {
    let html = patchHtml(existing.html || '', existing, next);
    if (Array.isArray(b.items)) {
      const prevById = new Map(loadItems(id).map((item) => [item.id, item]));
      if (existing.slug === 'statti') {
        b.items = assignPostSlugs(withPostDates(b.items, prevById), prevById).sort((a, b) =>
          String(b.created_at || '').localeCompare(String(a.created_at || ''))
        );
        b.items.forEach((item, i) => {
          item.sort_order = i;
        });
        html = renderStattiPosts(html, b.items);
        writeArticlePages(html, b.items);
      } else {
        for (const item of b.items) {
          const prev = prevById.get(Number(item.id));
          if (!prev) continue;
          html = replaceUnique(html, prev.title, item.title || '');
          html = replaceUnique(html, prev.image, item.image || '');
          html = replaceUnique(html, prev.href, item.href || '');
          if (prev.price && item.price && prev.price !== item.price) {
            html = replaceUnique(html, prev.price, item.price);
          }
        }
      }
      db.prepare(`DELETE FROM page_items WHERE page_id = ?`).run(id);
      const ins = db.prepare(
        `INSERT INTO page_items (page_id, kind, group_label, title, description, href, image, price, sort_order, published, created_at, body, slug, photos, videos)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      b.items.forEach((item, i) => {
        const photos = item.kind === 'post' ? postPhotos(item) : [];
        const videos = item.kind === 'post' ? postVideos(item) : [];
        const image = item.kind === 'post' ? coverPhoto(item) : item.image || '';
        const href = item.kind === 'post' ? videos[0] || '' : item.href || '';
        if (!item.title && !href && !image && !item.description && !item.price && !item.body && !photos.length && !videos.length) return;
        ins.run(
          id,
          item.kind || 'card',
          item.group_label || '',
          item.title || '',
          item.description || '',
          href,
          image,
          item.price || '',
          item.sort_order ?? i,
          item.published === 0 || item.published === false ? 0 : 1,
          item.created_at || '',
          item.body || '',
          item.slug || '',
          item.kind === 'post' ? JSON.stringify(photos) : '',
          item.kind === 'post' ? JSON.stringify(videos) : ''
        );
      });
    }
    if (existing.slug === 'statti' && html) {
      html = withStattiOpenGraph(html, Array.isArray(b.items) ? b.items : loadItems(id));
      writePage(path.join(PUBLIC_DIR, 'statti.html'), html);
      writeSitemap();
    }
    db.prepare(
      `UPDATE pages SET title=?, eyebrow=?, lead=?, parent_link=?, parent_label=?,
        meta_title=?, meta_description=?, html=?, updated_at=datetime('now') WHERE id=?`
    ).run(
      next.title,
      next.eyebrow,
      next.lead,
      next.parent_link,
      next.parent_label,
      next.meta_title,
      next.meta_description,
      html,
      id
    );
  });

  try {
    save();
    res.json(loadPage(id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/publish', requireAuth, (req, res) => {
  const page = db.prepare('SELECT slug, html FROM pages WHERE id = ?').get(Number(req.params.id));
  if (!page?.html) return res.status(404).json({ error: 'Немає збереженого HTML' });
  const out = path.join(PUBLIC_DIR, `${page.slug}.html`);
  writePage(out, page.html);
  writeSitemap();
  res.json({ ok: true, slug: page.slug });
});

export default router;
