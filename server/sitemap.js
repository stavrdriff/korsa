import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR, SITE_URL } from './config.js';
import { esc } from './html.js';

/** Записує сторінку лише якщо вміст змінився — інакше дата файлу (lastmod у sitemap) лишається старою */
export function writePage(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.writeFileSync(file, content, 'utf8');
  return true;
}

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
  writePage(path.join(PUBLIC_DIR, 'sitemap.xml'), xml);
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  writePage(path.join(PUBLIC_DIR, 'robots.txt'), robots);
  return names.length;
}
