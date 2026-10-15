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
