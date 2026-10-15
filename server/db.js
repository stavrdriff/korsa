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

const categoryCols = db.prepare('PRAGMA table_info(categories)').all();
if (!categoryCols.some((c) => c.name === 'manual')) {
  db.exec(`ALTER TABLE categories ADD COLUMN manual INTEGER DEFAULT 0`);
}

const productCols = db.prepare('PRAGMA table_info(products)').all();
if (!productCols.some((c) => c.name === 'details_html')) {
  db.exec(`ALTER TABLE products ADD COLUMN details_html TEXT DEFAULT ''`);
}

const pageCols = db.prepare('PRAGMA table_info(pages)').all().map((c) => c.name);
for (const [name, ddl] of [
  ['kind', `ALTER TABLE pages ADD COLUMN kind TEXT DEFAULT 'section'`],
  ['eyebrow', `ALTER TABLE pages ADD COLUMN eyebrow TEXT DEFAULT ''`],
  ['lead', `ALTER TABLE pages ADD COLUMN lead TEXT DEFAULT ''`],
  ['parent_link', `ALTER TABLE pages ADD COLUMN parent_link TEXT DEFAULT ''`],
  ['parent_label', `ALTER TABLE pages ADD COLUMN parent_label TEXT DEFAULT ''`],
  ['html', `ALTER TABLE pages ADD COLUMN html TEXT DEFAULT ''`],
  ['sort_order', `ALTER TABLE pages ADD COLUMN sort_order INTEGER DEFAULT 0`],
]) {
  if (!pageCols.includes(name)) db.exec(ddl);
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

const itemCols = db.prepare('PRAGMA table_info(page_items)').all();
if (!itemCols.some((c) => c.name === 'published')) {
  db.exec(`ALTER TABLE page_items ADD COLUMN published INTEGER DEFAULT 1`);
}
if (!itemCols.some((c) => c.name === 'created_at')) {
  db.exec(`ALTER TABLE page_items ADD COLUMN created_at TEXT DEFAULT ''`);
}
if (!itemCols.some((c) => c.name === 'body')) {
  db.exec(`ALTER TABLE page_items ADD COLUMN body TEXT DEFAULT ''`);
}
if (!itemCols.some((c) => c.name === 'slug')) {
  db.exec(`ALTER TABLE page_items ADD COLUMN slug TEXT DEFAULT ''`);
}
if (!itemCols.some((c) => c.name === 'photos')) {
  db.exec(`ALTER TABLE page_items ADD COLUMN photos TEXT DEFAULT ''`);
}
if (!itemCols.some((c) => c.name === 'videos')) {
  db.exec(`ALTER TABLE page_items ADD COLUMN videos TEXT DEFAULT ''`);
}

export default db;

export function touch(table, id) {
  db.prepare(
    `UPDATE ${table} SET updated_at = datetime('now') WHERE id = ?`
  ).run(id);
}
