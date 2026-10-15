import fs from 'node:fs';
import path from 'node:path';
import db from '../db.js';
import { PUBLIC_DIR } from '../config.js';
import { writeSitemap } from '../sitemap.js';

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
    const html = String(row.html).replaceAll('old/', '');
    const out = path.join(PUBLIC_DIR, `${row.slug}.html`);
    fs.writeFileSync(out, html, 'utf8');
    results.push({ slug: row.slug, path: out });
  }
  writeSitemap();
  return results;
}
