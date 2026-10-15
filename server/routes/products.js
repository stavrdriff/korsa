import { Router } from 'express';
import slugify from 'slugify';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

function cleanHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function replaceSpecs(id, specs) {
  if (!Array.isArray(specs)) return;
  db.prepare('DELETE FROM product_specs WHERE product_id = ?').run(id);
  const ins = db.prepare(
    'INSERT INTO product_specs (product_id, label, value, sort_order) VALUES (?,?,?,?)'
  );
  specs.forEach((s, i) => {
    if (s.label && s.value) ins.run(id, s.label, s.value, s.sort_order ?? i);
  });
}

function replaceMedia(id, media) {
  if (!Array.isArray(media)) return;
  db.prepare('DELETE FROM product_media WHERE product_id = ?').run(id);
  const ins = db.prepare(
    'INSERT INTO product_media (product_id, path, alt, sort_order) VALUES (?,?,?,?)'
  );
  media.forEach((m, i) => {
    const src = String(m?.path || '').trim();
    if (!src) return;
    ins.run(id, src, m.alt || '', m.sort_order ?? i);
  });
}

function loadProduct(id) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return null;
  product.specs = db
    .prepare(
      'SELECT id, label, value, sort_order FROM product_specs WHERE product_id = ? ORDER BY sort_order, id'
    )
    .all(id);
  product.media = db
    .prepare(
      'SELECT id, path, alt, sort_order FROM product_media WHERE product_id = ? ORDER BY sort_order, id'
    )
    .all(id);
  return product;
}

router.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, c.title AS category_title,
              (SELECT COUNT(*) FROM product_media m WHERE m.product_id = p.id) AS photo_count,
              (SELECT COUNT(*) FROM product_specs s WHERE s.product_id = p.id) AS spec_count
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.sort_order, p.title`
    )
    .all();
  res.json(rows);
});

router.get('/catalog', (_req, res) => {
  const products = db
    .prepare(
      `SELECT p.id, 'product' AS source, p.title, p.slug, p.category_id,
              c.title AS category_title, p.published,
              NULL AS page_id, NULL AS item_id
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id`
    )
    .all();
  const models = db
    .prepare(
      `SELECT NULL AS id, 'model' AS source, i.title, pg.slug, c.id AS category_id,
              c.title AS category_title, pg.published, pg.id AS page_id, i.id AS item_id
       FROM page_items i
       JOIN pages pg ON pg.id = i.page_id
       JOIN categories c ON c.slug = pg.slug
       WHERE i.kind = 'model'
         AND NOT EXISTS (
           SELECT 1 FROM products p
           WHERE p.category_id = c.id AND p.title = i.title
         )`
    )
    .all();
  const goods = [...products, ...models].sort((a, b) =>
    String(a.title).localeCompare(String(b.title), 'uk')
  );
  res.json(goods);
});

router.get('/:id', (req, res) => {
  const product = loadProduct(Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

router.post('/', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'title обовʼязковий' });
  const slug =
    b.slug || slugify(b.title, { lower: true, strict: true, locale: 'uk' });

  const insert = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO products (
          slug, category_id, title, subtitle, description, badge,
          cover_image, video_url, video_poster, parent_link, parent_label,
          meta_title, meta_description, details_html, published, sort_order
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        slug,
        b.category_id || null,
        b.title,
        b.subtitle || '',
        b.description || '',
        b.badge || '',
        b.cover_image || '',
        b.video_url || '',
        b.video_poster || '',
        b.parent_link || '',
        b.parent_label || '',
        b.meta_title || '',
        b.meta_description || '',
        cleanHtml(b.details_html || ''),
        b.published === 0 ? 0 : 1,
        b.sort_order || 0
      );
    const id = info.lastInsertRowid;
    replaceSpecs(id, b.specs);
    replaceMedia(id, b.media);
    return id;
  });

  try {
    const id = insert();
    res.status(201).json(loadProduct(id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};

  const update = db.transaction(() => {
    db.prepare(
      `UPDATE products SET
        slug=?, category_id=?, title=?, subtitle=?, description=?, badge=?,
        cover_image=?, video_url=?, video_poster=?, parent_link=?, parent_label=?,
        meta_title=?, meta_description=?, details_html=?, published=?, sort_order=?,
        updated_at=datetime('now')
       WHERE id=?`
    ).run(
      b.slug ?? existing.slug,
      b.category_id !== undefined ? b.category_id : existing.category_id,
      b.title ?? existing.title,
      b.subtitle ?? existing.subtitle,
      b.description ?? existing.description,
      b.badge ?? existing.badge,
      b.cover_image ?? existing.cover_image,
      b.video_url ?? existing.video_url,
      b.video_poster ?? existing.video_poster,
      b.parent_link ?? existing.parent_link,
      b.parent_label ?? existing.parent_label,
      b.meta_title ?? existing.meta_title,
      b.meta_description ?? existing.meta_description,
      b.details_html !== undefined ? cleanHtml(b.details_html) : existing.details_html,
      b.published !== undefined ? (b.published ? 1 : 0) : existing.published,
      b.sort_order ?? existing.sort_order,
      id
    );

    replaceSpecs(id, b.specs);
    replaceMedia(id, b.media);
  });

  try {
    update();
    res.json(loadProduct(id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
