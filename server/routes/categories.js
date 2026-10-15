import { Router } from 'express';
import slugify from 'slugify';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count,
              (SELECT COUNT(*) FROM page_items i
                 JOIN pages pg ON pg.id = i.page_id
                 WHERE pg.slug = c.slug AND i.kind = 'model') AS model_count,
              (SELECT COUNT(*) FROM page_items i
                 JOIN pages pg ON pg.id = i.page_id
                 WHERE pg.slug = c.slug AND i.kind = 'article') AS article_count,
              (SELECT id FROM pages pg WHERE pg.slug = c.slug) AS page_id
       FROM categories c
       ORDER BY c.parent_id IS NOT NULL, c.sort_order, c.title`
    )
    .all();
  res.json(rows);
});

router.post('/', requireAuth, (req, res) => {
  const { title, description = '', cover_image = '', sort_order = 0, parent_id = null } =
    req.body || {};
  if (!title) return res.status(400).json({ error: 'title обовʼязковий' });
  const slug =
    req.body.slug ||
    slugify(title, { lower: true, strict: true, locale: 'uk' });
  try {
    const info = db
      .prepare(
        `INSERT INTO categories (slug, title, description, cover_image, sort_order, parent_id, manual)
         VALUES (?, ?, ?, ?, ?, ?, 1)`
      )
      .run(slug, title, description, cover_image, sort_order, parent_id);
    res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/page', requireAuth, (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(Number(req.params.id));
  if (!cat) return res.status(404).json({ error: 'Not found' });
  let page = db.prepare('SELECT id FROM pages WHERE slug = ?').get(cat.slug);
  if (!page) {
    const info = db
      .prepare(
        `INSERT INTO pages (slug, title, kind, eyebrow, published) VALUES (?, ?, 'section', ?, 1)`
      )
      .run(cat.slug, cat.title, cat.title);
    page = { id: Number(info.lastInsertRowid) };
  }
  res.json(page);
});

router.put('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const {
    title = row.title,
    slug = row.slug,
    description = row.description,
    cover_image = row.cover_image,
    sort_order = row.sort_order,
    parent_id = row.parent_id,
  } = req.body || {};
  db.prepare(
    `UPDATE categories SET title=?, slug=?, description=?, cover_image=?, sort_order=?, parent_id=?, updated_at=datetime('now') WHERE id=?`
  ).run(title, slug, description, cover_image, sort_order, parent_id, id);
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
