import fs from 'node:fs';
import Database from 'better-sqlite3';
import { DATA_DIR, DB_PATH } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    cover_image TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    description TEXT DEFAULT '',
    badge TEXT DEFAULT '',
    cover_image TEXT DEFAULT '',
    video_url TEXT DEFAULT '',
    video_poster TEXT DEFAULT '',
    parent_link TEXT DEFAULT '',
    parent_label TEXT DEFAULT '',
    meta_title TEXT DEFAULT '',
    meta_description TEXT DEFAULT '',
    published INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS product_specs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    value TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS product_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    alt TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    meta_title TEXT DEFAULT '',
    meta_description TEXT DEFAULT '',
    body_html TEXT DEFAULT '',
    published INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

/** Додає колонку, якщо її ще немає (міграція старих баз) */
function addColumn(table, name, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

addColumn('categories', 'manual', 'INTEGER DEFAULT 0');
addColumn('products', 'details_html', "TEXT DEFAULT ''");
addColumn('pages', 'kind', "TEXT DEFAULT 'section'");
addColumn('pages', 'eyebrow', "TEXT DEFAULT ''");
addColumn('pages', 'lead', "TEXT DEFAULT ''");
addColumn('pages', 'parent_link', "TEXT DEFAULT ''");
addColumn('pages', 'parent_label', "TEXT DEFAULT ''");
addColumn('pages', 'html', "TEXT DEFAULT ''");
addColumn('pages', 'sort_order', 'INTEGER DEFAULT 0');

// Назва розділу була першим H2 — для пошуковиків це має бути H1 (по одному на сторінку)
for (const page of db.prepare(`SELECT id, html FROM pages WHERE html LIKE '%<h2%'`).all()) {
  const source = String(page.html);
  if (/<h1\b/i.test(source)) continue;
  const html = source.replace(/<h2(\b[^>]*)>([\s\S]*?)<\/h2>/i, '<h1$1>$2</h1>');
  db.prepare('UPDATE pages SET html = ? WHERE id = ?').run(html, page.id);
}

// Доступність: заголовки без пропуску рівнів (картки .feature — H3, колонки футера — H2)
// і орієнтир <main> навколо вмісту між шапкою та футером
for (const page of db.prepare(`SELECT id, html FROM pages WHERE html LIKE '%</header>%'`).all()) {
  const source = String(page.html);
  let html = source
    .replace(/(class="feature"[^>]*>(?:(?!<\/?h\d)[\s\S])*?)<h4(\b[^>]*)>([\s\S]*?)<\/h4>/gi, '$1<h3$2>$3</h3>')
    .replace(/<footer[\s\S]*?<\/footer>/i, (footer) => footer.replace(/<(\/?)h5\b/gi, '<$1h2'));
  if (!/<main\b/i.test(html) && /<footer\b/i.test(html)) {
    html = html.replace(/<\/header>/i, '</header>\n<main>').replace(/<footer\b/i, '</main>\n<footer');
  }
  html = promoteHeadings(html);
  if (html !== source) db.prepare('UPDATE pages SET html = ? WHERE id = ?').run(html, page.id);
}

/**
 * Після H1 одразу йшов H3 (назва розділу раніше була H2) — піднімає заголовки на рівень,
 * від H1 до першого наявного H2. Клас зі старим рівнем зберігає вигляд: h2.h3 у style.css
 * стилізований як h3.
 */
function promoteHeadings(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*)<\/main>/i);
  const levels = main ? [...main[1].matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1])) : [];
  if (levels[0] !== 1 || levels[1] !== 3) return html;
  const start = main.index + main[0].indexOf('</h1>');
  const nextH2 = html.slice(start).search(/<h2\b/i);
  const end = nextH2 < 0 ? main.index + main[0].length : start + nextH2;
  const segment = html
    .slice(start, end)
    .replace(/<h([3-6])\b([^>]*)>/gi, (tag, level, attrs) => {
      const cls = `h${level}`;
      const withClass = /\bclass="/i.test(attrs)
        ? attrs.replace(/\bclass="/i, `class="${cls} `)
        : ` class="${cls}"${attrs}`;
      return `<h${level - 1}${withClass}>`;
    })
    .replace(/<\/h([3-6])>/gi, (tag, level) => `</h${level - 1}>`);
  return html.slice(0, start) + segment + html.slice(end);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS page_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'card',
    group_label TEXT DEFAULT '',
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    href TEXT DEFAULT '',
    image TEXT DEFAULT '',
    price TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );
`);

addColumn('page_items', 'published', 'INTEGER DEFAULT 1');
addColumn('page_items', 'created_at', "TEXT DEFAULT ''");
addColumn('page_items', 'body', "TEXT DEFAULT ''");
addColumn('page_items', 'slug', "TEXT DEFAULT ''");
addColumn('page_items', 'photos', "TEXT DEFAULT ''");
addColumn('page_items', 'videos', "TEXT DEFAULT ''");

export default db;
