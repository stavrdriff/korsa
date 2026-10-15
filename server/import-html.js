import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';
import { ARCHIVE_DIR } from './config.js';

function decode(str = '') {
  return String(str)
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'");
}

function toPlain(html = '') {
  return decode(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h3|tr)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function attr(tag, name) {
  const m = String(tag).match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? decode(m[1]) : '';
}

function esc(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function stripDanger(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function parseProductFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  if (!html.includes('class="product-page"')) return null;
  // Сторінки-розділи (наприклад мансарда) містять товар всередині лендінгу — їх не перезаписуємо як один товар.
  if (html.includes('class="section__lead"') || html.includes('class="group-title"')) {
    return { skip: true, reason: 'landing' };
  }

  const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
  if (!h2) return { skip: true, reason: 'no-h2' };
  const badgeMatch = h2[1].match(/<span[^>]*>([\s\S]*?)<\/span>/);
  const title = toPlain(h2[1].replace(/<span[\s\S]*?<\/span>/, ''));
  const badge = badgeMatch ? toPlain(badgeMatch[1]) : '';

  const subMatch = html.match(/<h2[\s\S]*?<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/);
  const subtitle = subMatch ? toPlain(subMatch[1]) : '';

  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/);
  const metaDesc = html.match(/<meta name="description" content="([^"]*)"/);
  const mainImg = html.match(/<img[^>]*class="pp-main-img"[^>]*>/);
  const cover = mainImg ? attr(mainImg[0], 'src') : '';

  const thumbsBlock = html.match(/<div class="pp-thumbs">([\s\S]*?)<\/div>/);
  const media = [];
  if (thumbsBlock) {
    for (const tag of thumbsBlock[1].matchAll(/<img[^>]*>/g)) {
      const src = attr(tag[0], 'src');
      if (src) media.push({ path: src, alt: attr(tag[0], 'alt') });
    }
  }

  const video = html.match(/<a class="video-link"[^>]*href="([^"]+)"[\s\S]*?<\/a>/);
  const videoUrl = video ? decode(video[1]) : '';
  const posterTag = video ? video[0].match(/<img[^>]*>/) : null;
  const videoPoster = posterTag ? attr(posterTag[0], 'src') : '';

  const descMatch = html.match(/<p class="pp-desc">([\s\S]*?)<\/p>/);
  const description = descMatch ? toPlain(descMatch[1]) : '';

  const table = html.match(/<table class="pp-table">([\s\S]*?)<\/table>/);
  const specs = [];
  if (table) {
    for (const row of table[1].matchAll(/<tr>\s*<th>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
      const label = toPlain(row[1]);
      const value = toPlain(row[2]);
      if (label && value) specs.push({ label, value });
    }
  }

  const back = html.match(/<a href="([^"]+)"[^>]*>← Назад до ([^<]+)<\/a>/);
  const parentLink = back ? decode(back[1]) : '';
  const parentLabel = back ? toPlain(back[2]) : '';
  let categoryTitle = parentLabel;
  if (parentLink) {
    const crumb = html.match(/<div class="crumb">([\s\S]*?)<\/div>/);
    if (crumb) {
      const safeHref = parentLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const crumbLink = crumb[1].match(new RegExp(`<a href="${safeHref}">([^<]+)</a>`));
      if (crumbLink) categoryTitle = toPlain(crumbLink[1]);
    }
  }

  const start = html.indexOf('class="product-page"');
  const end = html.indexOf('class="cta-band"');
  const region = html.slice(start, end > start ? end : undefined);
  const chunks = [];
  for (const block of region.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3|<table class="pp-table"|$)/g)) {
    const heading = toPlain(block[1]);
    if (/^опис$/i.test(heading) || /^характеристики$/i.test(heading)) continue;
    const body = [...block[2].matchAll(/<(ul|ol|p)\b[\s\S]*?<\/\1>/g)].map((m) => m[0]).join('\n');
    if (!body) continue;
    chunks.push(
      `<h3 style="margin:24px 0 10px;color:#1e3a5f;font-size:17px">${esc(heading)}</h3>\n${body}`
    );
  }
  const afterTable = (region.split(/<table class="pp-table">[\s\S]*?<\/table>/)[1] || '');
  for (const note of afterTable.matchAll(/<p\b[\s\S]*?<\/p>/g)) {
    chunks.push(note[0]);
  }

  return {
    title,
    badge,
    subtitle,
    description,
    cover_image: cover,
    video_url: videoUrl,
    video_poster: videoPoster,
    parent_link: parentLink,
    parent_label: parentLabel,
    category_title: categoryTitle,
    meta_title: titleTag ? toPlain(titleTag[1]) : title,
    meta_description: metaDesc ? decode(metaDesc[1]) : '',
    specs,
    media,
    details_html: stripDanger(chunks.join('\n')),
  };
}

function upsertCategory(slugFile, title) {
  const slug = slugFile.replace(/\.html$/i, '');
  if (!slug) return null;
  const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  if (existing) {
    if (title) {
      db.prepare(`UPDATE categories SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(
        title,
        existing.id
      );
    }
    return existing.id;
  }
  const info = db
    .prepare(
      `INSERT INTO categories (slug, title, description, sort_order) VALUES (?, ?, '', 50)`
    )
    .run(slug, title || slug);
  return info.lastInsertRowid;
}

export function importProductsFromHtml() {
  const files = fs
    .readdirSync(ARCHIVE_DIR)
    .filter((name) => name.endsWith('.html'))
    .sort();

  const upsert = db.prepare(`
    INSERT INTO products (
      slug, category_id, title, subtitle, description, badge,
      cover_image, video_url, video_poster, parent_link, parent_label,
      meta_title, meta_description, details_html, published, sort_order
    ) VALUES (
      @slug, @category_id, @title, @subtitle, @description, @badge,
      @cover_image, @video_url, @video_poster, @parent_link, @parent_label,
      @meta_title, @meta_description, @details_html, 1, @sort_order
    )
    ON CONFLICT(slug) DO UPDATE SET
      category_id = excluded.category_id,
      title = excluded.title,
      subtitle = excluded.subtitle,
      description = excluded.description,
      badge = excluded.badge,
      cover_image = excluded.cover_image,
      video_url = excluded.video_url,
      video_poster = excluded.video_poster,
      parent_link = excluded.parent_link,
      parent_label = excluded.parent_label,
      meta_title = excluded.meta_title,
      meta_description = excluded.meta_description,
      details_html = excluded.details_html,
      published = 1,
      sort_order = excluded.sort_order,
      updated_at = datetime('now')
  `);

  const result = { imported: 0, skipped: [], media: 0, specs: 0 };

  const run = db.transaction(() => {
    let order = 0;
    for (const name of files) {
      const parsed = parseProductFile(path.join(ARCHIVE_DIR, name));
      if (!parsed) continue;
      if (parsed.skip) {
        result.skipped.push({ file: name, reason: parsed.reason });
        continue;
      }
      if (!parsed.title) {
        result.skipped.push({ file: name, reason: 'empty-title' });
        continue;
      }

      const categoryId = parsed.parent_link
        ? upsertCategory(parsed.parent_link, parsed.category_title || parsed.parent_label)
        : null;

      upsert.run({
        slug: name.replace(/\.html$/i, ''),
        category_id: categoryId,
        title: parsed.title,
        subtitle: parsed.subtitle,
        description: parsed.description,
        badge: parsed.badge,
        cover_image: parsed.cover_image,
        video_url: parsed.video_url,
        video_poster: parsed.video_poster,
        parent_link: parsed.parent_link,
        parent_label: parsed.parent_label,
        meta_title: parsed.meta_title,
        meta_description: parsed.meta_description,
        details_html: parsed.details_html,
        sort_order: order++,
      });

      const row = db.prepare('SELECT id FROM products WHERE slug = ?').get(name.replace(/\.html$/i, ''));
      db.prepare('DELETE FROM product_specs WHERE product_id = ?').run(row.id);
      db.prepare('DELETE FROM product_media WHERE product_id = ?').run(row.id);
      const insSpec = db.prepare(
        'INSERT INTO product_specs (product_id, label, value, sort_order) VALUES (?,?,?,?)'
      );
      parsed.specs.forEach((s, i) => insSpec.run(row.id, s.label, s.value, i));
      const insMedia = db.prepare(
        'INSERT INTO product_media (product_id, path, alt, sort_order) VALUES (?,?,?,?)'
      );
      parsed.media.forEach((m, i) => insMedia.run(row.id, m.path, m.alt || '', i));
      result.imported += 1;
      result.media += parsed.media.length;
      result.specs += parsed.specs.length;
    }
  });

  run();
  return result;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const { importPagesFromHtml } = await import('./import-pages.js');
  const result = importProductsFromHtml();
  const pages = importPagesFromHtml();
  console.log(
    `Товари: ${result.imported}, характеристик ${result.specs}, фото ${result.media}`
  );
  console.log(
    `Розділи: ${pages.imported}, карток ${pages.cards}, моделей ${pages.models}, фото галерей ${pages.gallery}`
  );
  if (result.skipped.length) {
    console.log('Окремі картки товарів пропущено як розділи:');
    for (const s of result.skipped) console.log(` - ${s.file} (${s.reason})`);
  }
  const { syncSiteTree } = await import('./site-tree.js');
  const tree = syncSiteTree();
  console.log(`Каталог: ${tree.roots} розділів верхнього рівня, у дереві ${tree.categories}`);
}
