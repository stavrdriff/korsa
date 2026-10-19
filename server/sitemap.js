import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, PUBLIC_DIR, SITE_URL } from './config.js';
import { esc } from './html.js';

/** Хеш вмісту й lastmod кожної сторінки — з ним видно, чи сторінка справді змінилась */
const LASTMOD_FILE = path.join(DATA_DIR, 'lastmod.json');

function readLastmod() {
  try {
    return JSON.parse(fs.readFileSync(LASTMOD_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/** Дати з поточного sitemap.xml — стартові значення для сторінок, яких ще немає в lastmod.json */
function sitemapDates() {
  const file = path.join(PUBLIC_DIR, 'sitemap.xml');
  const xml = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const dates = new Map();
  for (const [, loc, date] of xml.matchAll(/<loc>([^<]*)<\/loc><lastmod>([^<]*)<\/lastmod>/g)) {
    const name = loc.replace(`${SITE_URL}/`, '') || 'index.html';
    dates.set(name, date);
  }
  return dates;
}

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
  const known = readLastmod();
  const listed = sitemapDates();
  const today = new Date().toISOString().slice(0, 10);
  const next = {};
  const urls = names.map((name) => {
    const loc = name === 'index.html' ? `${SITE_URL}/` : `${SITE_URL}/${name}`;
    const hash = crypto.createHash('sha1').update(fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8')).digest('hex');
    const prev = known[name];
    // Дата оновлюється лише коли змінився вміст сторінки, а не дата файлу на диску
    const modified = prev ? (prev.hash === hash ? prev.date : today) : listed.get(name) || today;
    next[name] = { hash, date: modified };
    return `  <url><loc>${esc(loc)}</loc><lastmod>${modified}</lastmod></url>`;
  });
  writePage(LASTMOD_FILE, `${JSON.stringify(next, null, 2)}\n`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  writePage(path.join(PUBLIC_DIR, 'sitemap.xml'), xml);
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  writePage(path.join(PUBLIC_DIR, 'robots.txt'), robots);
  return names.length;
}
