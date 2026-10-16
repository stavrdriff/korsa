import path from 'node:path';
import db from '../db.js';
import { PUBLIC_DIR } from '../config.js';
import { writePage, writeSitemap } from '../sitemap.js';
import { publishArticlePages } from '../routes/pages.js';

function safeSlug(slug) {
  return /^[a-z0-9-]+$/i.test(String(slug || ''));
}

export function publishAllPages() {
  const rows = db
    .prepare(`SELECT slug, html FROM pages WHERE published = 1 AND html IS NOT NULL AND html != ''`)
    .all();
  const results = [];
  for (const row of rows) {
    if (!safeSlug(row.slug)) continue;
    const out = path.join(PUBLIC_DIR, `${row.slug}.html`);
    writePage(out, row.html);
    results.push({ slug: row.slug, path: out });
  }
  publishArticlePages();
  writeSitemap();
  return results;
}
