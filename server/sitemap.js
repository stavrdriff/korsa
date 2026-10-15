import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR, SITE_URL } from './config.js';
import { esc } from './html.js';

export function writeSitemap() {
  const names = fs
    .readdirSync(PUBLIC_DIR)
    .filter((name) => name.endsWith('.html'))
    .sort((a, b) => {
      if (a === 'index.html') return -1;
      if (b === 'index.html') return 1;
      return a.localeCompare(b);
    });
  const urls = names.map((name) => {
    const loc = name === 'index.html' ? `${SITE_URL}/` : `${SITE_URL}/${name}`;
    const modified = fs.statSync(path.join(PUBLIC_DIR, name)).mtime.toISOString().slice(0, 10);
    return `  <url><loc>${esc(loc)}</loc><lastmod>${modified}</lastmod></url>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), xml, 'utf8');
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), robots, 'utf8');
  return names.length;
}
