import fs from 'node:fs';
import path from 'node:path';
import db from './db.js';
import { ARCHIVE_DIR } from './config.js';
import { decode } from './html.js';

function toPlain(html = '') {
  return decode(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function headingText(html = '') {
  return toPlain(String(html).replace(/<small[\s\S]*?<\/small>/gi, '').replace(/<span[\s\S]*?<\/span>/gi, ''));
}

function attr(tag, name) {
  const m = String(tag).match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? '') : '';
}

function isStandaloneProduct(html) {
  return (
    html.includes('class="product-page"') &&
    !html.includes('class="section__lead"') &&
    !html.includes('class="group-title"')
  );
}

function blocksByClass(html, className) {
  const re = new RegExp(
    `<a\\b[^>]*class\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>[\\s\\S]*?</a>`,
    'gi'
  );
  return [...html.matchAll(re)].map((m) => m[0]);
}

function imageFrom(block) {
  const img = block.match(/<img\b[^>]*>/i);
  if (img) {
    const src = attr(img[0], 'src');
    if (src) return src;
  }
  const bg = block.match(/background-image:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
  return bg ? decode(bg[1]) : '';
}

function parseCards(html, className, kind) {
  const items = [];
  for (const block of blocksByClass(html, className)) {
    const titleMatch = block.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i);
    const descMatch =
      block.match(/class="[^"]*(?:vendor-card__desc|cat__body)[^"]*"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) ||
      block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const href = attr(block.match(/<a\b[^>]*>/i)?.[0] || '', 'href');
    const title = titleMatch ? headingText(titleMatch[1]) : '';
    if (!title && !href) continue;
    const bullets = [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => toPlain(m[1]))
      .filter(Boolean);
    const description = [descMatch ? toPlain(descMatch[1]) : '', ...bullets.map((line) => `• ${line}`)]
      .filter(Boolean)
      .join('\n');
    items.push({
      kind,
      group_label: '',
      title,
      description,
      href,
      image: imageFrom(block),
      price: '',
    });
  }
  return items;
}

function groupsBefore(html) {
  return [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].map((m) => ({
    index: m.index,
    label: headingText(m[1]),
  }));
}

function groupAt(heads, index) {
  let label = '';
  for (const head of heads) {
    if (head.index < index) label = head.label;
    else break;
  }
  return label;
}

function nearestSection(html, index) {
  let label = '';
  for (const m of html.matchAll(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)) {
    if (m.index >= index) break;
    if (/vendor-card|cta-band|motor-|fabric-card/.test(m[2])) continue;
    const before = html.slice(Math.max(0, m.index - 280), m.index);
    if (/class="cat__body"|class="vendor-card"|class="cta-band"/.test(before)) continue;
    const text = headingText(m[3]);
    if (text) label = text;
  }
  return label;
}

function parsePriceList(html) {
  const hasModels = /<article class="product\b/.test(html);
  const items = [];
  const heads = groupsBefore(html);
  for (const table of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const service = /Найменування послуги/.test(table[0]);
    const named = />\s*Найменування\s*</.test(table[0]);
    if (!named && !service) continue;
    const kind = !hasModels && named && !service ? 'model' : 'price';
    const collection = groupAt(heads, table.index);
    let section = collection;
    for (const row of table[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
      const cells = [...row[0].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)];
      if (!cells.length) continue;
      if (cells.length === 1 || /colspan\s*=\s*["']2["']/.test(row[0])) {
        const label = toPlain(cells[0][1]).replace(/^[^\p{L}\p{N}]+/u, '').trim();
        if (label && !/найменування|ціна/i.test(label)) {
          section = collection ? `${collection} · ${label}` : label;
        }
        continue;
      }
      const rawName = cells[0][1];
      const badge = rawName.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i);
      const title = toPlain(rawName.replace(/<span\b[\s\S]*?<\/span>/gi, ''));
      const price = toPlain(cells.at(-1)[1]).replace(/\*+$/, '').trim();
      if (!title || !/\d/.test(price) || /найменування/i.test(title)) continue;
      items.push({
        kind,
        group_label: section,
        title,
        description: badge ? toPlain(badge[1]) : '',
        href: '',
        image: '',
        price: /грн/i.test(price) ? price : `${price} грн`,
      });
    }
  }
  return items;
}

function parseModels(html) {
  const items = [];
  const heads = groupsBefore(html);
  const re = /<article class="product\b[^"]*">[\s\S]*?<\/article>/gi;
  for (const m of html.matchAll(re)) {
    const group = groupAt(heads, m.index);
    const block = m[0];
    const name = block.match(/class="product__name"[^>]*>([\s\S]*?)<\/h4>/i);
    const model = block.match(/class="product__model"[^>]*>([\s\S]*?)<\/p>/i);
    const price = block.match(/class="product__price"[\s\S]*?<strong>([\s\S]*?)<\/strong>/i);
    const btn = block.match(/class="product__btn"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="product__btn"/i);
    const title = name ? toPlain(name[1].replace(/<span class="badge">[\s\S]*?<\/span>/gi, '')) : '';
    if (!title) continue;
    items.push({
      kind: 'model',
      group_label: group,
      title,
      description: model ? toPlain(model[1]) : '',
      href: decode(btn?.[1] || btn?.[2] || ''),
      image: imageFrom(block),
      price: price ? toPlain(price[1]).replace(/\*+$/, '').trim() : '',
    });
  }
  return items;
}

function sliceDivs(html, className) {
  const re = new RegExp(
    `<div\\b[^>]*class\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    'gi'
  );
  const blocks = [];
  for (const m of html.matchAll(re)) {
    let depth = 0;
    const tagRe = /<\/?div\b[^>]*>/gi;
    tagRe.lastIndex = m.index;
    let tag;
    while ((tag = tagRe.exec(html))) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        blocks.push({ index: m.index, html: html.slice(m.index, tag.index + tag[0].length) });
        break;
      }
    }
  }
  return blocks;
}

function blankItem(extra) {
  return {
    kind: 'block',
    group_label: '',
    title: '',
    description: '',
    href: '',
    image: '',
    price: '',
    ...extra,
  };
}

function parseGallery(html) {
  const items = [];
  const heads = groupsBefore(html);
  const re = /<a\b[^>]*class="[^"]*gallery__item[^"]*"[^>]*>[\s\S]*?<\/a>|<div class="gallery__item"[^>]*>[\s\S]*?<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const img = m[0].match(/<img\b[^>]*>/i);
    const video = m[0].match(/<video\b[^>]*>/i);
    const src = img ? attr(img[0], 'src') : video ? attr(video[0], 'src') : '';
    if (!src) continue;
    items.push(
      blankItem({
        kind: 'gallery',
        group_label: groupAt(heads, m.index) || 'Фото',
        title: img ? attr(img[0], 'alt') : '',
        href: attr(m[0].match(/<a\b[^>]*>/i)?.[0] || '', 'href') || src,
        image: src,
      })
    );
  }
  return items;
}

function parseArticles(html) {
  const items = [];
  const heads = groupsBefore(html);
  const re = /<div class="color-card">[\s\S]*?<div class="color-name">[\s\S]*?<\/div>\s*<\/div>/gi;
  for (const m of html.matchAll(re)) {
    const img = m[0].match(/<img\b[^>]*>/i);
    const src = img ? attr(img[0], 'src') : '';
    if (!src) continue;
    const raw = m[0].match(/class="color-name">([\s\S]*?)<\/div>/i)?.[1] || '';
    const color = raw.match(/<small>([\s\S]*?)<\/small>/i);
    items.push(
      blankItem({
        kind: 'article',
        group_label: groupAt(heads, m.index) || 'Артикули',
        title: headingText(raw),
        description: color ? toPlain(color[1]) : '',
        image: src,
      })
    );
  }
  return items;
}

function parseDecor(html) {
  const items = [];
  const heads = groupsBefore(html);

  for (const block of sliceDivs(html, 'feature')) {
    const icon = block.html.match(/class="feature__icon">([\s\S]*?)<\/div>/i);
    const title = block.html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const text = block.html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    const link = block.html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
    const name = title ? toPlain(title[1]) : '';
    if (!name) continue;
    const extra = link ? toPlain(link[1]) : '';
    const description = [text ? toPlain(text[1]) : '', extra && extra !== name ? extra : '']
      .filter(Boolean)
      .join('\n');
    items.push(
      blankItem({
        pos: block.index,
        group_label: nearestSection(html, block.index) || 'Переваги',
        title: icon ? `${toPlain(icon[1])} ${name}`.trim() : name,
        description,
      })
    );
  }

  for (const block of sliceDivs(html, 'cta-band')) {
    const title = block.html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const text = block.html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    if (!title) continue;
    items.push(
      blankItem({
        pos: block.index,
        group_label: 'Заклик',
        title: headingText(title[1]),
        description: text ? toPlain(text[1]) : '',
      })
    );
  }

  for (const col of sliceDivs(html, 'offerings__col')) {
    const head = col.html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const group = head ? headingText(head[1]) : 'Перелік';
    for (const li of col.html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const icon = li[1].match(/class="offerings__icon">([\s\S]*?)<\/span>/i);
      const title = li[1].match(/<strong>([\s\S]*?)<\/strong>/i);
      const text = li[1].match(/<strong>[\s\S]*?<\/strong>\s*<span>([\s\S]*?)<\/span>/i);
      if (!title) continue;
      items.push(
        blankItem({
          pos: col.index + li.index,
          group_label: group,
          title: `${icon ? `${toPlain(icon[1])} ` : ''}${toPlain(title[1])}`.trim(),
          description: text ? toPlain(text[1]) : '',
        })
      );
    }
  }

  for (const className of ['motor-card', 'sensor-card']) {
    for (const block of sliceDivs(html, className)) {
      const title = block.html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const text = block.html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
      const specs = [...block.html.matchAll(/class="motor-spec">([\s\S]*?)<\/div>/gi)].map((m) =>
        toPlain(m[1]).replace(/\n+/g, ' ')
      );
      if (!title) continue;
      items.push(
        blankItem({
          pos: block.index,
          group_label: className === 'sensor-card' ? 'Датчики' : 'Двигуни',
          title: headingText(title[1]),
          description: [text ? toPlain(text[1]) : '', ...specs].filter(Boolean).join('\n'),
          image: imageFrom(block.html),
        })
      );
    }
  }

  for (const block of sliceDivs(html, 'fabric-card')) {
    const title = block.html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const info = block.html.match(/class="fabric-info">([\s\S]*?)<\/p>/i);
    const flag = block.html.match(/class="fabric-flag">([\s\S]*?)<\/span>/i);
    const badge = block.html.match(/class="fabric-badge">([\s\S]*?)<\/span>/i);
    if (!title) continue;
    items.push(
      blankItem({
        pos: block.index,
        group_label: 'Серії тканин',
        title: headingText(title[1]),
        description: [badge ? toPlain(badge[1]) : '', flag ? toPlain(flag[1]) : '', info ? toPlain(info[1]) : '']
          .filter(Boolean)
          .join('\n'),
      })
    );
  }

  for (const m of html.matchAll(/<p class="group-lead">([\s\S]*?)<\/p>/gi)) {
    items.push(
      blankItem({
        pos: m.index,
        group_label: groupAt(heads, m.index) || 'Текст',
        title: 'Текст розділу',
        description: toPlain(m[1]),
      })
    );
  }

  for (const m of html.matchAll(/<p\b[^>]*id="price-note"[^>]*>([\s\S]*?)<\/p>/gi)) {
    items.push(
      blankItem({
        pos: m.index,
        group_label: 'Примітка',
        title: 'Примітка щодо цін',
        description: toPlain(m[1]),
      })
    );
  }

  for (const m of html.matchAll(/<p class="pp-desc">([\s\S]*?)<\/p>/gi)) {
    items.push(
      blankItem({
        pos: m.index,
        group_label: groupAt(heads, m.index) || 'Опис',
        title: 'Опис',
        description: toPlain(m[1]),
      })
    );
  }

  for (const table of html.matchAll(/<table class="pp-table">([\s\S]*?)<\/table>/gi)) {
    const group = groupAt(heads, table.index) || 'Характеристики';
    for (const row of table[1].matchAll(/<tr>\s*<th>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
      const title = toPlain(row[1]);
      const description = toPlain(row[2]);
      if (!title) continue;
      items.push(blankItem({ pos: table.index, group_label: group, title, description }));
    }
  }

  for (const m of html.matchAll(
    /<div class="stat__num">([\s\S]*?)<\/div>\s*<div class="stat__lbl">([\s\S]*?)<\/div>/gi
  )) {
    items.push(
      blankItem({
        pos: m.index,
        group_label: 'Цифри',
        title: `${toPlain(m[1])} ${toPlain(m[2])}`.trim(),
      })
    );
  }

  const offerCta = html.match(/class="offerings__cta"[^>]*>([\s\S]*?)<\/div>/i);
  if (offerCta) {
    for (const link of offerCta[1].matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      items.push(
        blankItem({
          pos: offerCta.index + link.index,
          group_label: 'Кнопки',
          title: toPlain(link[2]),
          href: decode(link[1]),
        })
      );
    }
  }

  const thumbs = html.match(/<div class="pp-thumbs">([\s\S]*?)<\/div>/i);
  if (thumbs) {
    const group = groupAt(heads, thumbs.index) || 'Фото';
    let n = 0;
    for (const tag of thumbs[1].matchAll(/<img\b[^>]*>/gi)) {
      const src = attr(tag[0], 'src');
      if (!src) continue;
      n += 1;
      items.push(
        blankItem({
          pos: thumbs.index,
          kind: 'gallery',
          group_label: group,
          title: attr(tag[0], 'alt') || `Фото ${n}`,
          href: src,
          image: src,
        })
      );
    }
  }

  return items;
}

function parseLooseImages(html, taken) {
  const items = [];
  const heads = groupsBefore(html);
  const headerEnd = html.search(/<\/header>/i);
  const footerStart = html.search(/<footer\b/i);
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (headerEnd > 0 && m.index < headerEnd) continue;
    if (footerStart > 0 && m.index > footerStart) continue;
    const src = attr(m[0], 'src');
    if (!src || taken.has(src)) continue;
    const after = html.slice(m.index, m.index + 380);
    const cap = after.match(/^<img\b[^>]*>[\s\S]{0,140}?<div\b[^>]*>([^<]{2,80})<\/div>/);
    const title = (cap ? toPlain(cap[1]) : attr(m[0], 'alt')).trim();
    if (!title) continue;
    taken.add(src);
    items.push(
      blankItem({
        kind: 'gallery',
        group_label: groupAt(heads, m.index) || 'Фото',
        title,
        href: src,
        image: src,
      })
    );
  }
  return items;
}

function parseHero(html) {
  const items = [];
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1) return items;
  const para = html.match(/<h1\b[\s\S]*?<\/h1>\s*<p>([\s\S]*?)<\/p>/i);
  items.push(
    blankItem({
      pos: h1.index,
      group_label: 'Шапка сайту',
      title: toPlain(h1[1]),
      description: para ? toPlain(para[1]) : '',
    })
  );
  const buttons = html.match(/class="hero__btns"[^>]*>([\s\S]*?)<\/div>/i);
  if (buttons) {
    for (const link of buttons[1].matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      items.push(
        blankItem({
          pos: buttons.index + link.index,
          group_label: 'Шапка сайту',
          title: toPlain(link[2]),
          href: decode(link[1]),
        })
      );
    }
  }
  for (const chip of html.matchAll(/class="chip">([\s\S]*?)<\/span>/gi)) {
    items.push(
      blankItem({
        pos: chip.index,
        kind: 'chip',
        group_label: 'Плашки',
        title: toPlain(chip[1]),
      })
    );
  }
  const card = html.match(/<a\b[^>]*class="[^"]*hero__video[^"]*"[^>]*>[\s\S]*?<\/a>/i);
  if (card) {
    const title = card[0].match(/class="video-card__title">([\s\S]*?)<\/div>/i);
    const sub = card[0].match(/class="video-card__sub">([\s\S]*?)<\/div>/i);
    const imgs = [...card[0].matchAll(/<img\b[^>]*>/gi)];
    items.push(
      blankItem({
        pos: card.index,
        group_label: 'Шапка сайту',
        title: title ? toPlain(title[1]) : 'Відео',
        description: sub ? toPlain(sub[1]) : '',
        href: attr(card[0], 'href'),
        image: imgs[0] ? attr(imgs[0][0], 'src') : '',
      })
    );
    imgs.forEach((img, n) => {
      const src = attr(img[0], 'src');
      if (!src) return;
      items.push(
        blankItem({
          pos: card.index + n + 1,
          kind: 'gallery',
          group_label: 'Відео',
          title: attr(img[0], 'alt') || `Кадр ${n + 1}`,
          href: src,
          image: src,
        })
      );
    });
  }
  return items;
}

function parseFooter(html) {
  const found = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i);
  if (!found) return [];
  const footer = found[1];
  const items = [];
  const tagline = footer.match(/<span>\s*КОРСА\s*<small>([\s\S]*?)<\/small>/i);
  const blurb = footer.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  items.push(
    blankItem({
      kind: 'footer',
      group_label: 'Про компанію',
      title: 'КОРСА',
      description: [tagline ? toPlain(tagline[1]) : '', blurb ? toPlain(blurb[1]) : ''].filter(Boolean).join('\n'),
    })
  );
  for (const col of footer.matchAll(/<h5[^>]*>([\s\S]*?)<\/h5>\s*<ul>([\s\S]*?)<\/ul>/gi)) {
    const group = toPlain(col[1]);
    for (const li of col[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const link = li[1].match(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      const title = toPlain(link ? link[2] : li[1]);
      if (!title) continue;
      items.push(
        blankItem({
          kind: 'footer',
          group_label: group,
          title,
          href: link ? decode(link[1]) : '',
        })
      );
    }
  }
  const bottom = footer.match(/class="footer__bottom"[^>]*>([\s\S]*?)<\/div>/i);
  if (bottom) {
    for (const span of bottom[1].matchAll(/<span>([\s\S]*?)<\/span>/gi)) {
      const title = toPlain(span[1]);
      if (!title) continue;
      items.push(blankItem({ kind: 'footer', group_label: 'Низ', title }));
    }
  }
  return items;
}

function parsePage(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  if (isStandaloneProduct(html)) return null;

  const slug = path.basename(filePath, '.html');
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i);
  const metaDesc = html.match(/<meta name="description" content="([^"]*)"/i);
  const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const eyebrow = html.match(/<span class="eyebrow">([\s\S]*?)<\/span>/i);
  const lead = html.match(/<p class="section__lead">([\s\S]*?)<\/p>/i);
  const crumb = html.match(/<div class="crumb">([\s\S]*?)<\/div>/i);
  let parentLink = '';
  let parentLabel = '';
  if (crumb) {
    const links = [...crumb[1].matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)];
    const parent = links.at(-1);
    if (parent) {
      parentLink = decode(parent[1]);
      parentLabel = toPlain(parent[2]);
    }
  }

  const cards = [
    ...parseCards(html, 'vendor-card', 'card'),
    ...parseCards(html, 'cat', 'card'),
  ];
  const models = [...parseModels(html), ...parsePriceList(html)];
  const gallery = parseGallery(html);
  const articles = parseArticles(html);
  const decor = [...parseDecor(html), ...(slug === 'index' ? parseHero(html) : [])];
  const taken = new Set(
    [...cards, ...models, ...gallery, ...articles, ...decor].map((item) => item.image).filter(Boolean)
  );
  const loose = parseLooseImages(html, taken);
  const footer = parseFooter(html);

  const kind =
    slug === 'index' ? 'home' : slug === 'catalog' ? 'catalog' : slug === 'contacts' ? 'contacts' : 'section';

  return {
    slug,
    kind,
    title: h2 ? headingText(h2[1]) : toPlain(titleTag?.[1] || slug),
    eyebrow: eyebrow ? toPlain(eyebrow[1]) : '',
    lead: lead ? toPlain(lead[1]) : '',
    meta_title: titleTag ? toPlain(titleTag[1]) : '',
    meta_description: metaDesc ? decode(metaDesc[1]) : '',
    parent_link: parentLink,
    parent_label: parentLabel,
    html,
    items: [...decor, ...cards, ...models, ...articles, ...gallery, ...loose, ...footer]
      .map((item, index) => ({ ...item, pos: Number.isFinite(item.pos) ? item.pos : 1_000_000 + index }))
      .sort((a, b) => a.pos - b.pos),
  };
}

export function importPagesFromHtml() {
  const files = fs
    .readdirSync(ARCHIVE_DIR)
    .filter((name) => name.endsWith('.html'))
    .sort();

  const upsert = db.prepare(`
    INSERT INTO pages (
      slug, title, meta_title, meta_description, body_html, published,
      kind, eyebrow, lead, parent_link, parent_label, html, sort_order, updated_at
    ) VALUES (
      @slug, @title, @meta_title, @meta_description, '', 1,
      @kind, @eyebrow, @lead, @parent_link, @parent_label, @html, @sort_order, datetime('now')
    )
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      meta_title = excluded.meta_title,
      meta_description = excluded.meta_description,
      kind = excluded.kind,
      eyebrow = excluded.eyebrow,
      lead = excluded.lead,
      parent_link = excluded.parent_link,
      parent_label = excluded.parent_label,
      html = excluded.html,
      sort_order = excluded.sort_order,
      published = 1,
      updated_at = datetime('now')
  `);

  const insertItem = db.prepare(`
    INSERT INTO page_items (page_id, kind, group_label, title, description, href, image, price, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = { imported: 0, cards: 0, models: 0, gallery: 0, skippedProducts: 0 };

  const run = db.transaction(() => {
    let order = 0;
    for (const name of files) {
      const parsed = parsePage(path.join(ARCHIVE_DIR, name));
      if (!parsed) {
        result.skippedProducts += 1;
        continue;
      }
      upsert.run({ ...parsed, sort_order: order++ });
      const page = db.prepare('SELECT id FROM pages WHERE slug = ?').get(parsed.slug);
      db.prepare('DELETE FROM page_items WHERE page_id = ?').run(page.id);
      parsed.items.forEach((item, i) => {
        insertItem.run(
          page.id,
          item.kind,
          item.group_label || '',
          item.title || '',
          item.description || '',
          item.href || '',
          item.image || '',
          item.price || '',
          i
        );
      });
      const cat = db.prepare('SELECT id, description, cover_image FROM categories WHERE slug = ?').get(parsed.slug);
      if (cat) {
        const cover = parsed.items.find((item) => item.image)?.image || '';
        db.prepare(
          `UPDATE categories SET description = CASE WHEN description = '' THEN ? ELSE description END,
            cover_image = CASE WHEN cover_image = '' THEN ? ELSE cover_image END,
            updated_at = datetime('now') WHERE id = ?`
        ).run(parsed.lead, cover, cat.id);
      }
      result.imported += 1;
      result.cards += parsed.items.filter((i) => i.kind === 'card').length;
      result.models += parsed.items.filter((i) => i.kind === 'model').length;
      result.gallery += parsed.items.filter((i) => i.kind === 'gallery').length;
    }
  });

  run();
  return result;
}
