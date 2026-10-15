import db from './db.js';

function pageBySlug(slug) {
  return db.prepare('SELECT id FROM pages WHERE slug = ?').get(slug);
}

function cardsOf(pageId) {
  return db
    .prepare(
      `SELECT title, description, href, image, sort_order
       FROM page_items WHERE page_id = ? AND kind = 'card' ORDER BY sort_order, id`
    )
    .all(pageId);
}

function upsertCategory({ slug, title, description, cover, parentId, sort }) {
  const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
  if (existing) {
    db.prepare(
      `UPDATE categories
       SET title = ?, description = ?, cover_image = ?, parent_id = ?, sort_order = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(title, description || '', cover || '', parentId, sort, existing.id);
    return existing.id;
  }
  const info = db
    .prepare(
      `INSERT INTO categories (slug, title, description, cover_image, parent_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(slug, title, description || '', cover || '', parentId, sort);
  return Number(info.lastInsertRowid);
}

/**
 * Дерево категорій = картки каталогу і вкладені розділи.
 * Картки, що ведуть на товар, категоріями не стають.
 */
export function syncSiteTree() {
  const catalog = pageBySlug('catalog');
  if (!catalog) return { roots: 0, categories: 0 };

  const keep = new Set();

  function walk(items, parentId) {
    let n = 0;
    items.forEach((item, index) => {
      const slug = String(item.href || '').replace(/\.html$/i, '');
      const page = pageBySlug(slug);
      if (!page) return;
      const id = upsertCategory({
        slug,
        title: item.title || slug,
        description: item.description || '',
        cover: item.image || '',
        parentId,
        sort: index,
      });
      keep.add(id);
      n += 1;
      n += walk(cardsOf(page.id), id);
    });
    return n;
  }

  const total = db.transaction(() => {
    const count = walk(cardsOf(catalog.id), null);

    const products = db.prepare('SELECT id, parent_link FROM products').all();
    const setCat = db.prepare('UPDATE products SET category_id = ? WHERE id = ?');
    for (const product of products) {
      const slug = String(product.parent_link || '').replace(/\.html$/i, '');
      const cat = slug ? db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug) : null;
      setCat.run(cat?.id ?? null, product.id);
    }

    const stale = db
      .prepare('SELECT id, manual FROM categories')
      .all()
      .filter((row) => !keep.has(row.id) && !row.manual)
      .map((row) => row.id);
    if (stale.length) {
      const marks = stale.map(() => '?').join(',');
      db.prepare(`UPDATE products SET category_id = NULL WHERE category_id IN (${marks})`).run(...stale);
      db.prepare(`UPDATE categories SET parent_id = NULL WHERE parent_id IN (${marks})`).run(...stale);
      db.prepare(`DELETE FROM categories WHERE id IN (${marks})`).run(...stale);
    }

    return count;
  })();

  const roots = db.prepare('SELECT COUNT(*) AS c FROM categories WHERE parent_id IS NULL').get().c;
  return { roots, categories: total };
}
