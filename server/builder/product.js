import path from 'node:path';
import db from '../db.js';
import { PUBLIC_DIR } from '../config.js';
import { writePage, writeSitemap } from '../sitemap.js';
import { esc, stripScripts } from '../html.js';
import { headerHtml, footerHtml, PRODUCT_PAGE_CSS } from './partials.js';

function getProductBundle(idOrSlug) {
  const product =
    typeof idOrSlug === 'number' || /^\d+$/.test(String(idOrSlug))
      ? db.prepare('SELECT * FROM products WHERE id = ?').get(Number(idOrSlug))
      : db.prepare('SELECT * FROM products WHERE slug = ?').get(idOrSlug);

  if (!product) return null;

  const specs = db
    .prepare(
      'SELECT label, value FROM product_specs WHERE product_id = ? ORDER BY sort_order, id'
    )
    .all(product.id);

  const media = db
    .prepare(
      'SELECT path, alt FROM product_media WHERE product_id = ? ORDER BY sort_order, id'
    )
    .all(product.id);

  const category = product.category_id
    ? db.prepare('SELECT * FROM categories WHERE id = ?').get(product.category_id)
    : null;

  return { product, specs, media, category };
}

function renderProductHtml(bundle) {
  const { product, specs, media } = bundle;
  const title = product.meta_title || `${product.title} | Корса`;
  const desc = product.meta_description || product.description || '';
  const parentLink = product.parent_link || 'catalog.html';
  const parentLabel = product.parent_label || 'Каталог';
  const badge = product.badge
    ? ` <span style="display:inline-block;padding:3px 10px;background:var(--accent);color:white;border-radius:6px;font-size:13px;font-weight:600;vertical-align:middle;margin-left:8px">${esc(product.badge)}</span>`
    : '';

  const thumbs =
    media.length > 0
      ? `<div class="pp-thumbs">${media
          .map(
            (m) =>
              `<img src="${esc(m.path)}" alt="${esc(m.alt || product.title)}" loading="lazy" referrerpolicy="no-referrer" onclick="document.getElementById('ppMain').src=this.src">`
          )
          .join('')}</div>`
      : '';

  const video = product.video_url
    ? `<a class="video-link" href="${esc(product.video_url)}" target="_blank" rel="noopener">
          <img src="${esc(product.video_poster || '')}" alt="" loading="lazy" referrerpolicy="no-referrer">
          <div class="play"></div>
          <div class="label">▶ Відео огляд / встановлення</div>
        </a>`
    : '';

  const specsRows = specs
    .map(
      (s) =>
        `<tr><th>${esc(s.label)}</th><td>${esc(s.value)}</td></tr>`
    )
    .join('\n          ');

  const details = stripScripts(product.details_html);
  const cover = product.cover_image || (media[0]?.path ?? '');
  const isRemote = /^https?:\/\//i.test(cover);
  const imgAttrs = isRemote ? ' loading="lazy" referrerpolicy="no-referrer"' : ' loading="lazy"';

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="stylesheet" href="assets/style.css">
<style>
${PRODUCT_PAGE_CSS}
</style>
</head>
<body class="has-photo-bg bg-tiles bg-pos-win">
${headerHtml()}

<section class="section--blueprint section--photo-bg bg--tiles-win">
  <div class="section__inner">
    <div class="crumb"><a href="index.html">Головна</a> / <a href="catalog.html">Каталог</a> / <a href="${esc(parentLink)}">${esc(parentLabel)}</a> / ${esc(product.title)}</div>
    <a href="${esc(parentLink)}" style="display:inline-flex;align-items:center;gap:6px;color:var(--accent);text-decoration:none;font-size:13.5px;margin-bottom:14px;font-weight:500">← Назад до ${esc(parentLabel)}</a>

    <h1 style="margin:8px 0 4px;font-size:26px">${esc(product.title)}${badge}</h1>
    <p style="margin:0 0 18px;color:var(--muted);font-size:13.5px">${esc(product.subtitle)}</p>

    <div class="product-page">
      <div>
        <img class="pp-main-img" id="ppMain" src="${esc(cover)}" alt="${esc(product.title)}"${imgAttrs}>
        ${thumbs}
        ${video}
      </div>

      <div>
        <div class="pp-actions">
          <a href="contacts.html" class="primary">📞 Зв'язатися з менеджером</a>
          <a href="${esc(parentLink)}">↩ Усі моделі</a>
        </div>

        <h3 style="margin:18px 0 8px;color:#1e3a5f;font-size:17px">Опис</h3>
        <p class="pp-desc">${esc(product.description)}</p>

        <h3 style="margin:24px 0 10px;color:#1e3a5f;font-size:17px">Характеристики</h3>
        <table class="pp-table">
          ${specsRows}
        </table>
        ${details ? `<div class="pp-details">${details}</div>` : ''}
      </div>
    </div>

    <div class="cta-band" style="margin-top:48px">
      <div><h3>Розрахунок</h3><p>Опишіть тип та розмір — менеджер озвучить ціну в робочий день.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a href="tel:+380677712359" class="btn btn-primary">📞 067 771-23-59</a>
        <a href="https://t.me/+380677712359" class="btn btn-ghost">Telegram</a>
        <a href="https://wa.me/380677712359" class="btn btn-ghost">WhatsApp</a>
        <a href="contacts.html" class="btn btn-ghost">Контакти</a>
      </div>
    </div>

  </div>
</section>

${footerHtml()}
<script src="assets/script.js"></script>
</body>
</html>
`;
}

export function writeProductPage(idOrSlug, options = {}) {
  const bundle = getProductBundle(idOrSlug);
  if (!bundle) throw new Error(`Product not found: ${idOrSlug}`);
  if (!bundle.product.published) {
    return { skipped: true, slug: bundle.product.slug };
  }
  const html = renderProductHtml(bundle);
  const out = path.join(PUBLIC_DIR, `${bundle.product.slug}.html`);
  writePage(out, html);
  if (options.sitemap !== false) writeSitemap();
  return { path: out, slug: bundle.product.slug };
}

export function publishAllProducts() {
  const rows = db
    .prepare('SELECT id, slug FROM products WHERE published = 1')
    .all();
  const results = [];
  for (const row of rows) {
    results.push(writeProductPage(row.id, { sitemap: false }));
  }
  writeSitemap();
  return results;
}
