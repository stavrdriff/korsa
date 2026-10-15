import { api } from './api.js';

const views = {
  dashboard: document.getElementById('view-dashboard'),
  products: document.getElementById('view-products'),
  productEdit: document.getElementById('view-product-edit'),
  categories: document.getElementById('view-categories'),
  pageEdit: document.getElementById('view-page-edit'),
  posts: document.getElementById('view-posts'),
};

const titleEl = document.getElementById('pageTitle');
const flash = document.getElementById('flash');

function showFlash(text, ok = true) {
  flash.textContent = text;
  flash.className = `msg ${ok ? 'msg--ok' : 'msg--err'}`;
  flash.classList.remove('hidden');
  setTimeout(() => flash.classList.add('hidden'), 4000);
}

function showView(name, title) {
  Object.values(views).forEach((el) => el.classList.add('hidden'));
  views[name].classList.remove('hidden');
  titleEl.className = '';
  titleEl.textContent = title;
  document.querySelectorAll('.sidebar nav a[data-view]').forEach((a) => {
    const slug = a.dataset.slug || '';
    let active = !slug && a.dataset.view === name;
    if (name === 'pageEdit') {
      active = slug ? slug === sidebarPage : !sidebarPage && a.dataset.view === 'categories';
    }
    if (name === 'productEdit' && !slug) {
      active = a.dataset.view === (inCategoryFlow() ? 'categories' : 'products');
    }
    a.classList.toggle('active', active);
  });
}

async function requireAuth() {
  try {
    const me = await api('/auth/me');
    document.getElementById('userLabel').textContent = me.user;
  } catch {
    location.href = '/admin/login.html';
  }
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  location.href = '/admin/login.html';
});

document.querySelectorAll('.sidebar nav a[data-view]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const v = a.dataset.view;
    if (v === 'dashboard') loadDashboard();
    if (v === 'products') {
      categoryFilter = null;
      loadProducts();
    }
    if (v === 'categories') loadCategories(true);
    if (v === 'posts') loadPosts();
    if (a.dataset.slug) openSitePage(a.dataset.slug, a.textContent.trim());
  });
});

async function openSitePage(slug, title) {
  if (!sitePages.length) sitePages = await api('/pages');
  const page = sitePages.find((item) => item.slug === slug);
  if (!page) {
    showFlash('Сторінку не знайдено', false);
    return;
  }
  sidebarPage = slug;
  categoryStack = [{ title, page_id: page.id, loose: true }];
  openPageEdit(page.id);
}

async function loadDashboard() {
  showView('dashboard', 'Дашборд');
  const [goods, categories] = await Promise.all([api('/products/catalog'), api('/categories')]);
  document.getElementById('statProducts').textContent = goods.length;
  document.getElementById('statCategories').textContent = categories.filter((c) => !c.parent_id).length;
  document.getElementById('statPublished').textContent = goods.filter((item) => item.published).length;
}

let productCache = [];
let categoryFilter = null;

function visibleProducts() {
  const q = document.getElementById('productSearch').value.trim().toLowerCase();
  return productCache.filter((p) => {
    if (categoryFilter && p.category_id !== categoryFilter.id) return false;
    if (q && !`${p.title} ${p.slug}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderProducts(products) {
  document.getElementById('productCount').textContent = `${products.length} товарів`;
  const tbody = document.querySelector('#productsTable tbody');
  tbody.innerHTML = products
    .map((p) => {
      const file =
        p.source === 'product'
          ? `<br><small style="color:var(--muted)">${escapeHtml(p.slug)}.html</small>`
          : '';
      const edit =
        p.source === 'product'
          ? `<button class="btn btn-ghost" data-edit="${p.id}">Редагувати</button>
             <button class="btn btn-danger" data-del="${p.id}">✕</button>`
          : `<button class="btn btn-ghost" data-open-model="${p.item_id}" data-cat="${p.category_id}">Редагувати</button>`;
      return `<tr>
      <td><strong>${escapeHtml(p.title)}</strong>${file}</td>
      <td>${escapeHtml(p.category_title || '—')}</td>
      <td><span class="badge ${p.published ? '' : 'badge--off'}">${p.published ? 'опубліковано' : 'чернетка'}</span></td>
      <td class="row-actions">${edit}</td>
    </tr>`;
    })
    .join('');

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openProductEdit(Number(btn.dataset.edit)));
  });
  tbody.querySelectorAll('[data-open-model]').forEach((btn) => {
    btn.addEventListener('click', () => openModel(Number(btn.dataset.cat), Number(btn.dataset.openModel)));
  });
  tbody.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити товар?')) return;
      await api(`/products/${btn.dataset.del}`, { method: 'DELETE' });
      showFlash('Видалено');
      loadProducts();
    });
  });
}

function showProductFilter() {
  const note = document.getElementById('productFilterNote');
  if (!categoryFilter) {
    note.classList.add('hidden');
    note.textContent = '';
    return;
  }
  note.classList.remove('hidden');
  note.innerHTML = `Категорія: <strong>${escapeHtml(categoryFilter.title)}</strong> <button type="button" class="btn btn-ghost" id="clearProductFilter">Усі товари</button>`;
  document.getElementById('clearProductFilter').addEventListener('click', () => {
    categoryFilter = null;
    showProductFilter();
    renderProducts(visibleProducts());
  });
}

async function loadProducts() {
  showView('products', 'Товари');
  productCache = await api('/products/catalog');
  showProductFilter();
  renderProducts(visibleProducts());
}

async function openModel(categoryId, itemId) {
  if (!categoryCatalog.length) categoryCatalog = await api('/categories');
  const cat = categoryCatalog.find((c) => c.id === categoryId);
  if (!cat?.page_id) return;
  const stack = [];
  let current = cat;
  while (current) {
    stack.unshift(current);
    current = current.parent_id
      ? categoryCatalog.find((c) => c.id === current.parent_id)
      : null;
  }
  categoryStack = stack;
  productReturn = null;
  await openPageEdit(cat.page_id);
  document.getElementById(`page-item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.getElementById('productSearch').addEventListener('input', () => {
  renderProducts(visibleProducts());
});

document.getElementById('newProductBtn').addEventListener('click', () => openProductEdit(null));

let productReturn = null;

function inCategoryFlow() {
  return productReturn === 'categories' || productReturn === 'page';
}

async function backToCategory() {
  const back = productReturn;
  productReturn = null;
  if (back === 'page') {
    indexProducts(await api('/products'));
    const current = categoryStack.at(-1);
    if (current?.page_id) {
      openPageEdit(current.page_id);
      return;
    }
  }
  if (back === 'categories' || back === 'page') {
    loadCategories(false);
    return;
  }
  loadProducts();
}

async function openProductEdit(id, presetCategoryId = null) {
  const heading = id ? 'Товар' : 'Новий товар';
  showView('productEdit', heading);
  if (inCategoryFlow()) showCategoryBreadcrumb(heading);
  const form = document.getElementById('productForm');
  form.reset();
  form.dataset.id = id || '';
  delete form.dataset.publish;
  document.getElementById('specsBox').innerHTML = '';
  document.getElementById('galleryBox').innerHTML = '';
  setDetailsHtml('');

  const cats = flattenCategories(await api('/categories'));
  const sel = form.category_id;
  sel.innerHTML =
    '<option value="">— без категорії —</option>' +
    cats
      .map((c) => `<option value="${c.id}">${escapeHtml(`${'· '.repeat(c.depth)}${c.title}`)}</option>`)
      .join('');

  if (!id && presetCategoryId) {
    sel.value = String(presetCategoryId);
    const preset = cats.find((c) => c.id === presetCategoryId);
    if (preset) {
      form.parent_link.value = `${preset.slug}.html`;
      form.parent_label.value = preset.title;
    }
  }

  if (id) {
    const p = await api(`/products/${id}`);
    form.title.value = p.title;
    form.slug.value = p.slug;
    form.subtitle.value = p.subtitle || '';
    form.description.value = p.description || '';
    form.badge.value = p.badge || '';
    form.cover_image.value = p.cover_image || '';
    form.video_url.value = p.video_url || '';
    form.video_poster.value = p.video_poster || '';
    form.parent_link.value = p.parent_link || '';
    form.parent_label.value = p.parent_label || '';
    form.meta_title.value = p.meta_title || '';
    form.meta_description.value = p.meta_description || '';
    setDetailsHtml(p.details_html || '');
    form.published.checked = !!p.published;
    if (p.category_id) sel.value = String(p.category_id);
    (p.media || []).forEach((m) => addGalleryItem(m.path, m.alt));
    (p.specs || []).forEach((s) => addSpecRow(s.label, s.value));
    refreshProductCounts();
    if (inCategoryFlow()) showCategoryBreadcrumb(p.title || 'Товар');
    else titleEl.textContent = p.title || 'Товар';
  } else {
    addSpecRow('', '');
  }
}

function refreshProductCounts() {
  const photos = document.querySelectorAll('#galleryBox .gallery-item').length;
  const specs = [...document.querySelectorAll('#specsBox .spec-row')].filter((row) => {
    const [label, value] = row.querySelectorAll('input');
    return label.value.trim() || value.value.trim();
  }).length;
  document.getElementById('galleryCount').textContent = photos ? `(${photos})` : '';
  document.getElementById('specCount').textContent = specs ? `(${specs})` : '';
}

function addSpecRow(label = '', value = '') {
  const box = document.getElementById('specsBox');
  const row = document.createElement('div');
  row.className = 'spec-row';
  row.innerHTML = `
    <input placeholder="Характеристика" value="${escapeAttr(label)}">
    <input placeholder="Значення" value="${escapeAttr(value)}">
    <button type="button" class="btn btn-danger">✕</button>`;
  row.querySelector('button').addEventListener('click', () => {
    row.remove();
    refreshProductCounts();
  });
  row.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', refreshProductCounts);
  });
  box.appendChild(row);
  refreshProductCounts();
}

function mediaSrc(src) {
  const value = String(src || '').trim();
  if (!value || /^(https?:|data:|\/)/i.test(value)) return value;
  return `/${value.replace(/^\.\//, '')}`;
}

function addGalleryItem(src, alt = '') {
  if (!src) return;
  const box = document.getElementById('galleryBox');
  const item = document.createElement('div');
  item.className = 'gallery-item';
  item.dataset.path = src;
  item.dataset.alt = alt || '';
  const img = document.createElement('img');
  img.src = mediaSrc(src);
  img.alt = alt || '';
  img.referrerPolicy = 'no-referrer';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-danger';
  btn.textContent = 'Прибрати';
  btn.addEventListener('click', () => {
    item.remove();
    refreshProductCounts();
  });
  item.append(img, btn);
  box.appendChild(item);
  refreshProductCounts();
}

function collectGallery() {
  return [...document.querySelectorAll('#galleryBox .gallery-item')].map((item, i) => ({
    path: item.dataset.path,
    alt: item.dataset.alt || '',
    sort_order: i,
  }));
}

document.getElementById('galleryUrl').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('addGalleryUrl').click();
  }
});

document.getElementById('addGalleryUrl').addEventListener('click', () => {
  const input = document.getElementById('galleryUrl');
  const src = input.value.trim();
  if (!src) return;
  addGalleryItem(src);
  if (!document.getElementById('productForm').cover_image.value) {
    document.getElementById('productForm').cover_image.value = src;
  }
  input.value = '';
});

document.getElementById('uploadGalleryBtn').addEventListener('click', () => {
  document.getElementById('galleryFile').click();
});

document.getElementById('galleryFile').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  for (const file of files) {
    try {
      const path = await uploadImageFile(file);
      addGalleryItem(path);
      const cover = document.getElementById('productForm').cover_image;
      if (!cover.value) cover.value = path;
    } catch (err) {
      showFlash(err.message, false);
    }
  }
  if (files.length) showFlash(`Додано фото: ${files.length}`);
});

document.getElementById('addSpecBtn').addEventListener('click', () => addSpecRow());

document.getElementById('cancelProductBtn').addEventListener('click', () => {
  backToCategory();
});

const DETAILS_TAGS = new Set(['H2', 'H3', 'H4', 'H5', 'H6', 'P', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'B', 'I', 'BR', 'SPAN']);

function colorValue(el) {
  const fromStyle = (el.getAttribute('style') || '').match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  const raw = (fromStyle?.[1] || (el.tagName === 'FONT' ? el.getAttribute('color') : '') || '').trim().toLowerCase();
  if (!raw || raw === 'inherit' || raw === 'currentcolor' || raw === 'transparent') return '';
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return `#${h}`;
  }
  const rgb = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return '';
  return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

function fontSizeValue(el) {
  const raw = (el.getAttribute('style') || '').match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/i);
  if (!raw) return '';
  const px = Math.round(Number(raw[1]));
  if (px < 12 || px > 48) return '';
  return `${px}px`;
}

function setDetailsHtml(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html || '';
  document.getElementById('detailsBody').innerHTML = cleanDetailsNode(holder).innerHTML;
}

function cleanDetailsNode(node) {
  const out = document.createElement('div');
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.append(document.createTextNode(child.textContent));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName;
    if (tag === 'SPAN' || tag === 'FONT') {
      const color = colorValue(child);
      const size = fontSizeValue(child);
      const inner = cleanDetailsNode(child);
      const style = [color ? `color:${color}` : '', size ? `font-size:${size}` : ''].filter(Boolean).join(';');
      if (!style) {
        out.append(inner);
        continue;
      }
      const span = document.createElement('span');
      span.setAttribute('style', style);
      span.innerHTML = inner.innerHTML;
      out.append(span);
      continue;
    }
    if (tag === 'DIV') {
      const block = document.createElement('p');
      block.innerHTML = cleanDetailsNode(child).innerHTML;
      if (block.textContent.trim() || block.querySelector('br')) out.append(block);
      continue;
    }
    if (!DETAILS_TAGS.has(tag)) {
      out.append(cleanDetailsNode(child));
      continue;
    }
    const el = document.createElement(tag.toLowerCase());
    if (tag === 'BR') {
      out.append(el);
      continue;
    }
    el.innerHTML = cleanDetailsNode(child).innerHTML;
    out.append(el);
  }
  return out;
}

function mountPostRte(host, html) {
  host.className = 'rte';
  host.innerHTML = `
    <div class="rte__bar">
      <button type="button" data-cmd="bold"><b>Ж</b></button>
      <button type="button" data-cmd="italic"><i>К</i></button>
      <select data-block aria-label="Заголовок">
        <option value="">Заголовок</option>
        <option value="p">Звичайний</option>
        <option value="h2">Заголовок 2</option>
        <option value="h3">Заголовок 3</option>
        <option value="h4">Заголовок 4</option>
        <option value="h5">Заголовок 5</option>
        <option value="h6">Заголовок 6</option>
      </select>
      <select data-size aria-label="Розмір">
        <option value="">Розмір</option>
        <option value="0">Звичайний</option>
        <option value="14">14</option>
        <option value="16">16</option>
        <option value="18">18</option>
        <option value="20">20</option>
        <option value="24">24</option>
        <option value="28">28</option>
        <option value="32">32</option>
      </select>
      <button type="button" data-cmd="insertUnorderedList">Список</button>
      <button type="button" data-cmd="insertOrderedList">1. 2. 3.</button>
      <span class="rte__colors">
        <button type="button" class="rte__swatch rte__swatch--clear" data-color="" title="Звичайний">А</button>
        <button type="button" class="rte__swatch" data-color="#1e3a5f" style="--swatch:#1e3a5f" title="Синій"></button>
        <button type="button" class="rte__swatch" data-color="#2d5a8e" style="--swatch:#2d5a8e" title="Блакитний"></button>
        <button type="button" class="rte__swatch" data-color="#0f6e56" style="--swatch:#0f6e56" title="Зелений"></button>
        <button type="button" class="rte__swatch" data-color="#b45309" style="--swatch:#b45309" title="Помаранчевий"></button>
        <button type="button" class="rte__swatch" data-color="#c0392b" style="--swatch:#c0392b" title="Червоний"></button>
        <button type="button" class="rte__swatch" data-color="#7a4e2d" style="--swatch:#7a4e2d" title="Коричневий"></button>
        <button type="button" class="rte__swatch" data-color="#5c6b7a" style="--swatch:#5c6b7a" title="Сірий"></button>
        <label class="rte__custom" title="Свій колір">
          <input type="color" value="#c0392b" aria-label="Свій колір">
        </label>
      </span>
    </div>
    <div class="rte__body" contenteditable="true" data-placeholder="Повний текст статті"></div>
  `;
  const holder = document.createElement('div');
  holder.innerHTML = html || '';
  host.querySelector('.rte__body').innerHTML = cleanDetailsNode(holder).innerHTML;
  return bindRte(host);
}

/** Підключає панель редактора (.rte__bar) до поля .rte__body; повертає функцію, що читає очищений HTML */
function bindRte(host) {
  const body = host.querySelector('.rte__body');
  let range = null;
  const remember = () => {
    const sel = document.getSelection();
    if (!sel?.rangeCount) return;
    const current = sel.getRangeAt(0);
    if (body.contains(current.commonAncestorContainer)) range = current.cloneRange();
  };
  const restore = () => {
    body.focus();
    if (!range) return;
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const paint = (color) => {
    restore();
    if (!color) {
      const sel = document.getSelection();
      if (!sel?.rangeCount) return;
      const current = sel.getRangeAt(0);
      body.querySelectorAll('span[style*="color"]').forEach((span) => {
        if (!current.intersectsNode(span)) return;
        span.style.color = '';
        if (!span.getAttribute('style')?.trim()) span.replaceWith(...span.childNodes);
      });
      remember();
      return;
    }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, color);
    document.execCommand('styleWithCSS', false, false);
    remember();
  };
  const applySize = (px) => {
    restore();
    const sel = document.getSelection();
    if (!sel?.rangeCount || !body.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
    if (!px) {
      const current = sel.getRangeAt(0);
      body.querySelectorAll('span[style*="font-size"]').forEach((span) => {
        if (!current.intersectsNode(span)) return;
        span.style.fontSize = '';
        if (!span.getAttribute('style')?.trim()) span.replaceWith(...span.childNodes);
      });
      remember();
      return;
    }
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    body.querySelectorAll('font[size="7"]').forEach((el) => {
      const span = document.createElement('span');
      span.style.fontSize = `${px}px`;
      span.innerHTML = el.innerHTML;
      el.replaceWith(span);
    });
    remember();
  };
  host.querySelectorAll('button[data-cmd]').forEach((button) => {
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', () => {
      restore();
      const value = button.dataset.value;
      document.execCommand(button.dataset.cmd, false, value ? `<${value}>` : null);
    });
  });
  const blockSelect = host.querySelector('[data-block]');
  blockSelect?.addEventListener('mousedown', () => remember());
  blockSelect?.addEventListener('change', () => {
    const value = blockSelect.value;
    blockSelect.value = '';
    if (!value) return;
    restore();
    document.execCommand('formatBlock', false, `<${value}>`);
  });
  const sizeSelect = host.querySelector('[data-size]');
  sizeSelect?.addEventListener('mousedown', () => remember());
  sizeSelect?.addEventListener('change', () => {
    const value = sizeSelect.value;
    sizeSelect.value = '';
    if (value === '') return;
    applySize(value === '0' ? 0 : Number(value));
  });
  host.querySelectorAll('.rte__swatch').forEach((button) => {
    button.addEventListener('mousedown', (e) => {
      remember();
      e.preventDefault();
    });
    button.addEventListener('click', () => paint(button.dataset.color || ''));
  });
  const picker = host.querySelector('input[type="color"]');
  picker.addEventListener('mousedown', () => remember());
  picker.addEventListener('input', () => paint(picker.value));
  body.addEventListener('mouseup', remember);
  body.addEventListener('keyup', remember);
  return () => cleanDetailsNode(body).innerHTML.replace(/<p>\s*<\/p>/g, '').trim();
}

const readDetailsBody = bindRte(document.querySelector('#productForm .rte'));

function readDetailsHtml() {
  const html = readDetailsBody();
  document.getElementById('detailsHtml').value = html;
  return html;
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const specs = [...document.querySelectorAll('#specsBox .spec-row')]
    .map((row, i) => {
      const [label, value] = row.querySelectorAll('input');
      return { label: label.value.trim(), value: value.value.trim(), sort_order: i };
    })
    .filter((s) => s.label && s.value);

  const body = {
    title: form.title.value.trim(),
    slug: form.slug.value.trim() || undefined,
    subtitle: form.subtitle.value.trim(),
    description: form.description.value.trim(),
    badge: form.badge.value.trim(),
    cover_image: form.cover_image.value.trim(),
    video_url: form.video_url.value.trim(),
    video_poster: form.video_poster.value.trim(),
    parent_link: form.parent_link.value.trim(),
    parent_label: form.parent_label.value.trim(),
    meta_title: form.meta_title.value.trim(),
    meta_description: form.meta_description.value.trim(),
    details_html: readDetailsHtml(),
    category_id: form.category_id.value ? Number(form.category_id.value) : null,
    published: form.published.checked ? 1 : 0,
    specs,
    media: collectGallery(),
  };

  try {
    const id = form.dataset.id;
    if (id) await api(`/products/${id}`, { method: 'PUT', body });
    else await api('/products', { method: 'POST', body });
    showFlash('Збережено в адмінці');
    backToCategory();
  } catch (err) {
    showFlash(err.message, false);
  }
});

document.getElementById('uploadCoverBtn').addEventListener('click', () => {
  document.getElementById('coverFile').click();
});

document.getElementById('coverFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    document.getElementById('productForm').cover_image.value = await uploadImageFile(file);
    showFlash('Фото завантажено');
  } catch (err) {
    showFlash(err.message, false);
  }
});

function flattenCategories(cats) {
  const byParent = new Map();
  for (const cat of cats) {
    const key = cat.parent_id || 0;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(cat);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'uk'));
  const out = [];
  function walk(parentId, depth) {
    for (const cat of byParent.get(parentId) || []) {
      out.push({ ...cat, depth });
      walk(cat.id, depth + 1);
    }
  }
  walk(0, 0);
  return out;
}

let sidebarPage = null;
let categoryStack = [];
let categoryCatalog = [];
let sitePages = [];
let categoryProducts = [];
let productByHref = new Map();

function indexProducts(list) {
  categoryProducts = list;
  productByHref = new Map();
  for (const product of list) {
    productByHref.set(product.slug, product);
    productByHref.set(`${product.slug}.html`, product);
  }
}

function goodsCount(cat) {
  const own = Math.max(Number(cat.product_count) || 0, Number(cat.model_count) || 0);
  return childCategories(cat.id).reduce((sum, child) => sum + goodsCount(child), own);
}

function categoryHint(cat) {
  const nested = childCategories(cat.id).length;
  const goods = goodsCount(cat);
  const articles = Number(cat.article_count) || 0;
  return [
    nested ? `підкатегорій: ${nested}` : '',
    goods ? `товарів: ${goods}` : '',
    articles ? `артикулів: ${articles}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function childCategories(parentId) {
  return categoryCatalog
    .filter((c) => (c.parent_id || null) === (parentId || null))
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'uk'));
}

function showCategoryBreadcrumb(tail) {
  const loose = categoryStack.length === 1 && categoryStack[0].loose;
  const items = loose
    ? categoryStack.map((c, i) => ({ title: c.title, depth: i }))
    : [
        { title: 'Категорії', depth: -1 },
        ...categoryStack.map((c, i) => ({ title: c.title, depth: i })),
      ];
  if (tail) items.push({ title: tail, depth: null });
  titleEl.className = 'crumbs';
  titleEl.innerHTML = items
    .map((item, i) => {
      const sep = i ? `<span class="sep">/</span>` : '';
      const last = i === items.length - 1;
      if (last) return `${sep}<span>${escapeHtml(item.title)}</span>`;
      return `${sep}<button type="button" data-depth="${item.depth}">${escapeHtml(item.title)}</button>`;
    })
    .join('');
  titleEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const depth = Number(btn.dataset.depth);
      productReturn = null;
      if (depth < 0) {
        loadCategories(true);
        return;
      }
      categoryStack = categoryStack.slice(0, depth + 1);
      const current = categoryStack.at(-1);
      if (current?.page_id) openPageEdit(current.page_id);
      else loadCategories(false);
    });
  });
}

function renderCategoryLinks(box, cats) {
  box.innerHTML = cats
    .map((c) => {
      const hint = categoryHint(c);
      return `<button type="button" class="cat-link" data-enter="${c.id}">
        <span><strong>${escapeHtml(c.title)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</span>
        <span class="cat-link__go">${c.page_id ? 'Змінити' : 'Далі →'}</span>
      </button>`;
    })
    .join('');
  box.querySelectorAll('[data-enter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      enterCategory(categoryCatalog.find((c) => c.id === Number(btn.dataset.enter)));
    });
  });
}

function renderCategoryLevel() {
  const current = categoryStack.at(-1) || null;
  const parentId = current?.id || null;
  showCategoryBreadcrumb();

  const actions = document.getElementById('catActions');
  actions.style.display = current ? '' : 'none';
  actions.innerHTML = current
    ? `<button class="btn btn-ghost" type="button" id="showSubcatForm">+ Підкатегорія</button>
       <button class="btn" type="button" id="addProductHere">+ Товар</button>`
    : '';
  document.getElementById('showSubcatForm')?.addEventListener('click', () => {
    document.getElementById('newSubcatForm').classList.remove('hidden');
    document.getElementById('subcatTitle').focus();
  });
  document.getElementById('addProductHere')?.addEventListener('click', () => {
    productReturn = 'categories';
    openProductEdit(null, current.id);
  });

  const kids = childCategories(parentId);
  const list = document.getElementById('subcatList');
  renderCategoryLinks(list, kids);
  if (!kids.length && current) {
    list.innerHTML = `<p style="color:var(--muted);margin:8px 0">Підкатегорій ще немає. Додайте їх кнопкою зверху.</p>`;
  }

  const productBlock = document.getElementById('catProductBlock');
  const productBox = document.getElementById('catProducts');
  if (!current) {
    productBlock.classList.add('hidden');
    productBox.innerHTML = '';
    return;
  }
  const here = categoryProducts.filter((p) => p.category_id === current.id);
  productBlock.classList.remove('hidden');
  productBox.innerHTML = here.length
    ? here
        .map(
          (p) => `<button type="button" class="cat-link" data-edit-product="${p.id}">
            <span><strong>${escapeHtml(p.title)}</strong></span>
            <span class="cat-link__go">Змінити</span>
          </button>`
        )
        .join('')
    : `<p style="color:var(--muted);margin:0">Товарів у цій категорії ще немає.</p>`;
  productBox.querySelectorAll('[data-edit-product]').forEach((btn) => {
    btn.addEventListener('click', () => {
      productReturn = 'categories';
      openProductEdit(Number(btn.dataset.editProduct));
    });
  });
}

async function enterCategory(cat) {
  if (!cat) return;
  sidebarPage = null;
  categoryStack.push(cat);
  hideSubcatForm();
  try {
    let pageId = cat.page_id;
    if (!pageId) {
      const page = await api(`/categories/${cat.id}/page`, { method: 'POST' });
      pageId = page.id;
      cat.page_id = pageId;
    }
    openPageEdit(pageId);
  } catch (err) {
    categoryStack.pop();
    showFlash(err.message, false);
  }
}

function hideSubcatForm() {
  const form = document.getElementById('newSubcatForm');
  form.classList.add('hidden');
  form.reset();
}

async function loadCategories(reset = false) {
  sidebarPage = null;
  if (reset) categoryStack = [];
  showView('categories', 'Категорії');
  categoryCatalog = await api('/categories');
  sitePages = await api('/pages');
  indexProducts(await api('/products'));
  const current = categoryStack.at(-1);
  if (current) {
    const fresh = categoryCatalog.find((c) => c.id === current.id);
    if (fresh) categoryStack[categoryStack.length - 1] = fresh;
    else categoryStack = [];
  }
  hideSubcatForm();
  renderCategoryLevel();
}

async function createSubcategory(title, parent) {
  await api('/categories', { method: 'POST', body: { title, parent_id: parent.id, description: '' } });
  showFlash('Підкатегорію додано');
}

document.getElementById('cancelSubcat').addEventListener('click', hideSubcatForm);

document.getElementById('newSubcatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = categoryStack.at(-1);
  if (!current) return;
  const title = document.getElementById('subcatTitle').value.trim();
  if (!title) return;
  try {
    await createSubcategory(title, current);
    loadCategories(false);
  } catch (err) {
    showFlash(err.message, false);
  }
});

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll("'", '&#39;');
}

function splitTypeTag(title) {
  const match = String(title || '').match(/^(теплі|холодні)(?=\S)/);
  if (!match) return { tag: '', title: title || '' };
  return { tag: match[1], title: title.slice(match[1].length) };
}

async function uploadImageFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/media/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Не вдалося завантажити фото');
  return data.path;
}

function bindPhotoUpload(imageInput, preview) {
  const row = document.createElement('div');
  row.className = 'photo-row';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost';
  button.textContent = 'Завантажити фото';
  button.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    try {
      const path = await uploadImageFile(chosen);
      imageInput.value = path;
      if (preview) preview.src = mediaSrc(path);
      imageInput.dispatchEvent(new Event('input'));
      showFlash('Фото завантажено');
    } catch (err) {
      showFlash(err.message, false);
    }
  });
  imageInput.addEventListener('input', () => {
    if (preview) preview.src = mediaSrc(imageInput.value);
  });
  row.append(imageInput, button, file);
  return row;
}

function bindGroup(head) {
  const input = head.querySelector('.page-group-name');
  const sync = () => {
    let el = head.nextElementSibling;
    while (el && el.classList.contains('page-item')) {
      el.dataset.group = input.value.trim();
      el = el.nextElementSibling;
    }
  };
  input.addEventListener('input', sync);
  head.querySelector('[data-add-card]').addEventListener('click', () => {
    const row = createItemRow({ kind: 'model', group_label: input.value.trim() });
    let last = head;
    let el = head.nextElementSibling;
    while (el && el.classList.contains('page-item')) {
      last = el;
      el = el.nextElementSibling;
    }
    last.after(row);
    row.querySelector('[data-field="title"]').focus();
  });
}

function createItemRow(item) {
  const { tag, title } = splitTypeTag(item.title);
  const row = document.createElement('div');
  row.className = 'page-item';
  row.dataset.id = item.id || '';
  if (item.id) row.id = `page-item-${item.id}`;
  row.dataset.kind = item.kind || 'card';
  row.dataset.group = item.group_label || '';
  const img = previewImage(item.image);
  const fields = document.createElement('div');
  fields.innerHTML = `
    <input data-field="tag" value="${escapeAttr(tag)}" placeholder="теплі / холодні">
    <input data-field="title" value="${escapeAttr(title)}" placeholder="Назва">
    <textarea data-field="description" placeholder="Опис">${escapeHtml(item.description || '')}</textarea>
    <input data-field="price" value="${escapeAttr(item.price || '')}" placeholder="Ціна">
    <input data-field="href" value="${escapeAttr(item.href || '')}" placeholder="Посилання">`;
  const imageInput = document.createElement('input');
  imageInput.dataset.field = 'image';
  imageInput.value = item.image || '';
  imageInput.placeholder = 'Посилання на фото';
  fields.append(bindPhotoUpload(imageInput, img));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-ghost';
  remove.textContent = 'Прибрати картку';
  remove.addEventListener('click', () => {
    const prev = row.previousElementSibling;
    const next = row.nextElementSibling;
    row.remove();
    if (prev?.classList.contains('page-group') && !next?.classList.contains('page-item')) prev.remove();
  });
  fields.append(remove);
  const linked = productByHref.get(item.href || '');
  if (linked) {
    const note = document.createElement('p');
    note.className = 'linked-product';
    const photos = Number(linked.photo_count) || 0;
    const specs = Number(linked.spec_count) || 0;
    note.textContent = [photos ? `${photos} фото` : '', specs ? `${specs} характеристик` : '']
      .filter(Boolean)
      .join(' · ');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn';
    open.textContent = 'Фото і характеристики';
    open.addEventListener('click', () => {
      productReturn = 'page';
      openProductEdit(linked.id);
    });
    fields.append(note, open);
  }
  row.append(img, fields);
  return row;
}

function addPageItem(item) {
  const box = document.getElementById('pageItems');
  const group = item.group_label || '';
  const lastGroup = box.dataset.group;
  if (lastGroup !== group) {
    const head = document.createElement('div');
    head.className = 'page-group';
    head.innerHTML = `
      <input class="page-group-name" value="${escapeAttr(group)}" placeholder="Наприклад: Скляні конструкції">
      <button type="button" class="btn btn-ghost" data-add-card>Додати картку</button>`;
    box.appendChild(head);
    bindGroup(head);
    box.dataset.group = group;
  }
  box.appendChild(createItemRow(item));
}

function sectionShell(box, title, buttonLabel) {
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'row-actions';
  head.style.margin = '18px 0 8px';
  head.innerHTML = `<h3 style="margin:0;font-size:16px">${title}</h3>`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost';
  button.textContent = buttonLabel;
  head.append(button);
  box.append(head);
  return button;
}

function fieldInput(name, value, placeholder) {
  const input = document.createElement('input');
  input.dataset.field = name;
  input.value = value || '';
  input.placeholder = placeholder;
  return input;
}

function previewImage(src) {
  const img = document.createElement('img');
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  if (src) img.src = mediaSrc(src);
  return img;
}

function removeButton(target, label = 'Прибрати') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost';
  button.textContent = label;
  button.addEventListener('click', () => target.remove());
  return button;
}

function createBlockRow(item) {
  const row = document.createElement('div');
  row.className = 'page-item';
  row.dataset.kind = 'block';
  if (item.id) row.dataset.id = String(item.id);
  const img = previewImage(item.image);
  const fields = document.createElement('div');
  fields.append(fieldInput('title', item.title, 'Заголовок'));
  const text = document.createElement('textarea');
  text.dataset.field = 'description';
  text.placeholder = 'Текст';
  text.value = item.description || '';
  fields.append(text);
  fields.append(fieldInput('href', item.href, 'Посилання, наприклад на відео'));
  const image = fieldInput('image', item.image, 'Посилання на фото');
  fields.append(bindPhotoUpload(image, img));
  fields.append(removeButton(row));
  row.append(img, fields);
  return row;
}

function createPriceRow(item) {
  const row = document.createElement('div');
  row.className = 'page-item page-item--plain';
  row.dataset.kind = 'price';
  if (item.id) row.dataset.id = String(item.id);
  const fields = document.createElement('div');
  fields.className = 'plain-fields';
  fields.append(fieldInput('title', item.title, 'Послуга'));
  fields.append(fieldInput('price', item.price, 'Ціна'));
  fields.append(removeButton(row));
  if (item.description) {
    const text = document.createElement('textarea');
    text.dataset.field = 'description';
    text.placeholder = 'Примітка';
    text.value = item.description;
    fields.append(text);
  }
  row.append(fields);
  return row;
}

function createArticleRow(item) {
  const row = document.createElement('div');
  row.className = 'page-item';
  row.dataset.kind = 'article';
  if (item.id) row.dataset.id = String(item.id);
  const img = previewImage(item.image);
  const fields = document.createElement('div');
  fields.append(fieldInput('title', item.title, 'Код'));
  fields.append(fieldInput('description', item.description, 'Колір'));
  const image = fieldInput('image', item.image, 'Посилання на фото');
  fields.append(bindPhotoUpload(image, img));
  fields.append(removeButton(row));
  row.append(img, fields);
  return row;
}

function createFooterRow(item) {
  const row = document.createElement('div');
  row.className = 'page-item page-item--plain';
  row.dataset.kind = 'footer';
  if (item.id) row.dataset.id = String(item.id);
  const fields = document.createElement('div');
  fields.className = 'plain-fields';
  fields.append(fieldInput('title', item.title, 'Текст'));
  fields.append(fieldInput('href', item.href, 'Посилання'));
  fields.append(removeButton(row));
  if (item.description) {
    const text = document.createElement('textarea');
    text.dataset.field = 'description';
    text.placeholder = 'Текст';
    text.value = item.description;
    fields.append(text);
  }
  row.append(fields);
  return row;
}

function createShot(item) {
  const shot = document.createElement('div');
  shot.className = 'page-shot';
  shot.dataset.kind = 'gallery';
  if (item.id) shot.dataset.id = String(item.id);
  // У галереї бувають відео (mp4) — їх показуємо через <video>, бо <img> їх не відображає
  const isVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(item.image || '');
  const img = document.createElement(isVideo ? 'video' : 'img');
  if (isVideo) {
    img.muted = true;
    img.loop = true;
    img.playsInline = true;
    img.preload = 'metadata';
    img.title = 'Відео — наведіть, щоб переглянути';
    img.addEventListener('mouseenter', () => img.play().catch(() => {}));
    img.addEventListener('mouseleave', () => img.pause());
  } else {
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
  }
  if (item.image) img.src = mediaSrc(item.image);
  const title = fieldInput('title', item.title, 'Підпис');
  const image = fieldInput('image', item.image, '');
  image.hidden = true;
  const href = fieldInput('href', item.href || item.image, '');
  href.hidden = true;
  shot.append(img, title, image, href, removeButton(shot));
  return shot;
}

function createChip(item) {
  const chip = document.createElement('div');
  chip.className = 'chip-edit';
  chip.dataset.kind = 'chip';
  if (item.id) chip.dataset.id = String(item.id);
  const input = fieldInput('title', item.title, 'Нова плашка');
  const fit = () => {
    input.style.width = `${Math.max(input.placeholder.length, input.value.length, 4) + 1}ch`;
  };
  input.addEventListener('input', fit);
  fit();
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'chip-edit__x';
  remove.textContent = '×';
  remove.setAttribute('aria-label', 'Прибрати плашку');
  remove.addEventListener('click', () => chip.remove());
  chip.append(input, remove);
  return chip;
}

function fillChips(box, items) {
  const button = sectionShell(box, 'Плашки', '+ Плашка');
  const grid = document.createElement('div');
  grid.className = 'chip-grid';
  box.append(grid);
  items.forEach((item) => grid.append(createChip(item)));
  button.addEventListener('click', () => {
    const chip = createChip({ kind: 'chip', title: '' });
    grid.append(chip);
    chip.querySelector('input').focus();
  });
}

function fillRows(box, title, addLabel, items, kind, make) {
  const button = sectionShell(box, title, addLabel);
  let group = null;
  const appendRow = (item) => {
    const label = item.group_label || '';
    if (label !== group) {
      const head = document.createElement('div');
      head.className = 'page-group';
      head.innerHTML = `<input class="page-group-name" value="${escapeAttr(label)}" placeholder="Назва групи">`;
      box.append(head);
      group = label;
    }
    box.append(make(item));
  };
  items.forEach(appendRow);
  button.addEventListener('click', () => {
    appendRow({ kind, group_label: group || '', title: '', description: '', image: '', price: '', href: '' });
    box.querySelector('.page-item:last-child [data-field="title"]')?.focus();
  });
}

function fillShots(box, items) {
  const button = sectionShell(box, 'Фото', 'Завантажити фото');
  let group = null;
  let grid = null;
  const appendShot = (item) => {
    const label = item.group_label || '';
    if (label !== group || !grid) {
      const head = document.createElement('div');
      head.className = 'page-group';
      head.innerHTML = `<input class="page-group-name" value="${escapeAttr(label)}" placeholder="Назва групи">`;
      box.append(head);
      grid = document.createElement('div');
      grid.className = 'shot-grid';
      box.append(grid);
      group = label;
    }
    grid.append(createShot(item));
  };
  items.forEach(appendShot);
  button.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.hidden = true;
    input.addEventListener('change', async () => {
      const files = [...input.files];
      input.remove();
      for (const file of files) {
        try {
          const uploaded = await uploadImageFile(file);
          const name = file.name.replace(/\.[^.]+$/, '');
          appendShot({
            kind: 'gallery',
            group_label: group || 'Фото',
            title: name,
            href: uploaded,
            image: uploaded,
          });
        } catch (err) {
          showFlash(err.message, false);
        }
      }
    });
    document.body.append(input);
    input.click();
  });
}

function renderContentSections(items) {
  fillChips(
    document.getElementById('pageChips'),
    items.filter((item) => item.kind === 'chip')
  );
  fillRows(
    document.getElementById('pageBlocks'),
    'Блоки на сторінці',
    '+ Блок',
    items.filter((item) => item.kind === 'block'),
    'block',
    createBlockRow
  );
  fillRows(
    document.getElementById('pagePrices'),
    'Прайс',
    '+ Рядок',
    items.filter((item) => item.kind === 'price'),
    'price',
    createPriceRow
  );
  fillRows(
    document.getElementById('pageArticles'),
    'Артикули',
    '+ Артикул',
    items.filter((item) => item.kind === 'article'),
    'article',
    createArticleRow
  );
  fillShots(
    document.getElementById('pageShots'),
    items.filter((item) => item.kind === 'gallery')
  );
  fillRows(
    document.getElementById('pageFooter'),
    'Підвал',
    '+ Пункт',
    items.filter((item) => item.kind === 'footer'),
    'footer',
    createFooterRow
  );
}

function collectSection(box) {
  const items = [];
  let group = '';
  const take = (el) => {
    const field = (name) => el.querySelector(`[data-field="${name}"]`)?.value.trim() || '';
    const title = field('title');
    const description = field('description');
    const price = field('price');
    const href = field('href');
    const image = field('image');
    if (!title && !description && !image && !price && !href) return;
    items.push({
      id: Number(el.dataset.id) || undefined,
      kind: el.dataset.kind,
      group_label: group,
      title,
      description,
      price,
      href,
      image,
    });
  };
  for (const el of box.children) {
    if (el.classList.contains('row-actions')) continue;
    if (el.classList.contains('page-group')) {
      group = el.querySelector('.page-group-name')?.value.trim() || '';
      continue;
    }
    if (el.classList.contains('shot-grid') || el.classList.contains('chip-grid')) {
      el.querySelectorAll('.page-shot, .chip-edit').forEach(take);
      continue;
    }
    if (el.classList.contains('page-item')) take(el);
  }
  return items;
}

function paintPageItems(items) {
  const cards = items.filter((item) => item.kind === 'card' || item.kind === 'model' || !item.kind);
  const box = document.getElementById('pageItems');
  box.innerHTML = '';
  delete box.dataset.group;
  cards.forEach(addPageItem);
  renderContentSections(items);
}

async function openPageEdit(id) {
  showView('pageEdit', 'Сторінка');
  const loose = Boolean(categoryStack.at(-1)?.loose);
  document.getElementById('pageAddSubcat').style.display = loose ? 'none' : '';
  document.getElementById('pageAddProduct').style.display = loose ? 'none' : '';
  showCategoryBreadcrumb();
  const page = await api(`/pages/${id}`);
  const form = document.getElementById('pageForm');
  form.dataset.id = String(page.id);
  form.title.value = page.title || '';
  form.eyebrow.value = page.eyebrow || '';
  form.lead.value = page.lead || '';
  form.parent_link.value = page.parent_link || '';
  form.parent_label.value = page.parent_label || '';
  form.meta_title.value = page.meta_title || '';
  form.meta_description.value = page.meta_description || '';
  paintPageItems(page.items || []);
  renderPageExtras();
}

function renderPageExtras() {
  const current = categoryStack.at(-1);
  const kids = current && !current.loose ? childCategories(current.id) : [];
  renderCategoryLinks(document.getElementById('pageSubcats'), kids);
}

document.getElementById('pageAddSubcat').addEventListener('click', () => {
  document.getElementById('pageSubcatForm').classList.remove('hidden');
  document.getElementById('pageSubcatTitle').focus();
});

function hidePageSubcatForm() {
  const form = document.getElementById('pageSubcatForm');
  form.classList.add('hidden');
  form.reset();
}

document.getElementById('cancelPageSubcat').addEventListener('click', hidePageSubcatForm);

document.getElementById('pageAddProduct').addEventListener('click', () => {
  const current = categoryStack.at(-1);
  if (!current) return;
  productReturn = 'page';
  openProductEdit(null, current.id);
});

document.getElementById('pageSubcatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const current = categoryStack.at(-1);
  if (!current) return;
  const title = document.getElementById('pageSubcatTitle').value.trim();
  if (!title) return;
  try {
    await createSubcategory(title, current);
    hidePageSubcatForm();
    categoryCatalog = await api('/categories');
    const fresh = categoryCatalog.find((c) => c.id === current.id);
    if (fresh) categoryStack[categoryStack.length - 1] = fresh;
    if (fresh?.page_id) openPageEdit(fresh.page_id);
    else loadCategories(false);
  } catch (err) {
    showFlash(err.message, false);
  }
});

document.getElementById('cancelPageBtn').addEventListener('click', () => {
  const leaving = categoryStack.at(-1);
  categoryStack.pop();
  if (leaving?.loose) {
    sidebarPage = null;
    loadCategories(true);
    return;
  }
  const parent = categoryStack.at(-1);
  if (parent?.page_id) openPageEdit(parent.page_id);
  else loadCategories(false);
});

function groupLabelOf(row) {
  let el = row.previousElementSibling;
  while (el && !el.classList.contains('page-group')) el = el.previousElementSibling;
  return el?.querySelector('.page-group-name')?.value.trim() || row.dataset.group || '';
}

document.getElementById('showCardGroup').addEventListener('click', () => {
  document.getElementById('addCardGroupBox').classList.remove('hidden');
  document.getElementById('cardGroupTitle').focus();
});

document.getElementById('cancelCardGroup').addEventListener('click', () => {
  document.getElementById('addCardGroupBox').classList.add('hidden');
  document.getElementById('cardGroupTitle').value = '';
});

document.getElementById('cardGroupTitle').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  document.getElementById('confirmCardGroup').click();
});

document.getElementById('confirmCardGroup').addEventListener('click', () => {
  const title = document.getElementById('cardGroupTitle').value.trim();
  if (!title) return;
  addPageItem({ kind: 'model', group_label: title });
  document.getElementById('cardGroupTitle').value = '';
  document.getElementById('addCardGroupBox').classList.add('hidden');
  const names = document.querySelectorAll('#pageItems [data-field="title"]');
  names[names.length - 1]?.focus();
});

document.getElementById('uploadPosterBtn').addEventListener('click', () => {
  document.getElementById('posterFile').click();
});

document.getElementById('posterFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    document.getElementById('productForm').video_poster.value = await uploadImageFile(file);
    showFlash('Фото завантажено');
  } catch (err) {
    showFlash(err.message, false);
  }
});

document.getElementById('pageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const cards = [...document.querySelectorAll('#pageItems .page-item')].map((row) => {
    const field = (name) => row.querySelector(`[data-field="${name}"]`).value.trim();
    const tag = field('tag');
    const title = field('title');
    return {
      id: Number(row.dataset.id) || undefined,
      kind: row.dataset.kind,
      group_label: groupLabelOf(row),
      title: tag ? `${tag}${title}` : title,
      price: field('price'),
      description: field('description'),
      href: field('href'),
      image: field('image'),
    };
  });
  if (cards.some((item) => !item.title)) {
    showFlash('У кожної картки має бути назва', false);
    return;
  }
  const items = [
    ...collectSection(document.getElementById('pageChips')),
    ...collectSection(document.getElementById('pageBlocks')),
    ...collectSection(document.getElementById('pagePrices')),
    ...collectSection(document.getElementById('pageArticles')),
    ...cards,
    ...collectSection(document.getElementById('pageShots')),
    ...collectSection(document.getElementById('pageFooter')),
  ].map((item, i) => ({ ...item, sort_order: i }));
  try {
    const saved = await api(`/pages/${form.dataset.id}`, {
      method: 'PUT',
      body: {
        title: form.title.value.trim(),
        eyebrow: form.eyebrow.value.trim(),
        lead: form.lead.value.trim(),
        parent_link: form.parent_link.value.trim(),
        parent_label: form.parent_label.value.trim(),
        meta_title: form.meta_title.value.trim(),
        meta_description: form.meta_description.value.trim(),
        items,
      },
    });
    paintPageItems(saved.items || []);
    showFlash('Збережено в адмінці. Файл сайту не змінено.');
  } catch (err) {
    showFlash(err.message, false);
  }
});

let postsPageId = null;

function refreshPostsEmpty() {
  const empty = !document.querySelector('#postsList .post-card');
  document.getElementById('postsEmpty').classList.toggle('hidden', !empty);
}

function localStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function postDateLabel(stamp) {
  const match = String(stamp || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

function addPostCard(item = {}, prepend = false, open = false) {
  const card = document.createElement('article');
  card.className = 'post-card';
  if (item.id) card.dataset.id = String(item.id);
  if (item.slug) card.dataset.slug = item.slug;
  const created = item.created_at || '';
  if (created) card.dataset.createdAt = created;
  const kind = item.group_label === 'video' ? 'video' : 'article';
  const on = item.published !== 0 && item.published !== false;
  const added = postDateLabel(created);
  card.innerHTML = `
    <div class="post-card__top">
      <button type="button" class="post-card__name" data-toggle>
        <span class="post-card__mark" aria-hidden="true"></span>
        <span data-name></span>
      </button>
      ${added ? `<span class="post-card__date">Додано ${escapeHtml(added)}</span>` : ''}
    </div>
    <div class="post-card__body" hidden>
      <div class="post-card__top">
        <select data-field="kind">
          <option value="article">Стаття</option>
          <option value="video">Відео</option>
        </select>
        <label class="post-card__show">
          <input data-field="published" type="checkbox" ${on ? 'checked' : ''}> Показувати на сайті
        </label>
      </div>
      <label>Назва</label>
      <input data-field="title" value="${escapeAttr(item.title || '')}" placeholder="Наприклад: Як обрати вхідні двері">
      <label>Текст на картці</label>
      <textarea data-field="description" placeholder="Коротко, це видно у списку">${escapeHtml(item.description || '')}</textarea>
      <label>Повний текст</label>
      <div data-rte></div>
      <div class="post-media-head">
        <label>Фото</label>
        <button type="button" class="btn btn-ghost" data-add-photo>+ Фото</button>
      </div>
      <div data-photos></div>
      <div class="post-media-head">
        <label>Відео</label>
        <button type="button" class="btn btn-ghost" data-add-video>+ Відео</button>
      </div>
      <div data-videos></div>
      <div class="post-card__actions">
        <button type="button" class="btn" data-save>Зберегти</button>
        <a class="btn btn-ghost${item.slug ? '' : ' is-disabled'}" data-open target="_blank" rel="noopener" href="${item.slug ? `/stattia-${escapeAttr(item.slug)}.html` : '#'}">Відкрити сторінку</a>
        <button type="button" class="btn btn-danger" data-remove>Прибрати</button>
      </div>
    </div>
  `;
  card._readBody = mountPostRte(card.querySelector('[data-rte]'), editorHtml(item.body));
  card.querySelector('[data-field="kind"]').value = kind;
  const titleInput = card.querySelector('[data-field="title"]');
  const name = card.querySelector('[data-name]');
  const syncName = () => {
    name.textContent = titleInput.value.trim() || 'Новий матеріал';
  };
  titleInput.addEventListener('input', syncName);
  syncName();
  const body = card.querySelector('.post-card__body');
  const setOpen = (open) => {
    if (open) {
      document.querySelectorAll('#postsList .post-card.is-open').forEach((other) => {
        if (other === card) return;
        other.classList.remove('is-open');
        other.querySelector('.post-card__body').hidden = true;
      });
    }
    card.classList.toggle('is-open', open);
    body.hidden = !open;
  };
  card.querySelector('[data-toggle]').addEventListener('click', () => setOpen(body.hidden));
  card.querySelector('[data-save]').addEventListener('click', () => saveOnePost(card));
  card.querySelector('[data-open]').addEventListener('click', (e) => {
    if (card.dataset.slug) return;
    e.preventDefault();
    showFlash('Спочатку збережіть матеріал', false);
  });
  card.querySelector('[data-remove]').addEventListener('click', () => {
    card.remove();
    refreshPostsEmpty();
  });
  if (prepend || open) setOpen(true);
  const photoBox = card.querySelector('[data-photos]');
  const videoBox = card.querySelector('[data-videos]');
  const photos = item.photos?.length ? item.photos : item.image ? [item.image] : [];
  const videos = item.videos?.length ? item.videos : item.href ? [item.href] : [];
  const cover = item.image && photos.includes(item.image) ? item.image : photos[0];
  photos.forEach((src) => addPostPhoto(photoBox, src, src === cover && photos.indexOf(src) === photos.indexOf(cover)));
  videos.forEach((url) => addPostVideo(videoBox, url));
  card.querySelector('[data-add-photo]').addEventListener('click', () => addPostPhoto(photoBox));
  card.querySelector('[data-add-video]').addEventListener('click', () => addPostVideo(videoBox));
  const list = document.getElementById('postsList');
  if (prepend) list.prepend(card);
  else list.append(card);
  refreshPostsEmpty();
}

function editorHtml(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replaceAll('\n', '<br>')}</p>`)
    .join('');
}

function addPostPhoto(box, src = '', main = false) {
  if (!box.dataset.radio) box.dataset.radio = `post-main-${Math.random().toString(36).slice(2, 8)}`;
  const wrap = document.createElement('div');
  wrap.className = 'post-photo';
  const pick = document.createElement('label');
  pick.className = 'post-main';
  pick.innerHTML = `<input data-field="main" type="radio" name="${box.dataset.radio}"> Основне`;
  pick.querySelector('input').checked = main || !box.querySelector('[data-field="main"]');
  const input = document.createElement('input');
  input.dataset.field = 'photo';
  input.placeholder = 'Посилання на фото';
  input.value = src;
  const preview = document.createElement('img');
  preview.className = 'post-card__preview';
  preview.alt = '';
  if (src) preview.src = mediaSrc(src);
  else preview.classList.add('hidden');
  input.addEventListener('input', () => {
    const shown = mediaSrc(input.value);
    preview.src = shown;
    preview.classList.toggle('hidden', !shown);
  });
  const upload = document.createElement('div');
  upload.className = 'photo-row';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.multiple = true;
  file.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost';
  button.textContent = 'Завантажити';
  button.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const files = [...file.files];
    file.value = '';
    for (let i = 0; i < files.length; i += 1) {
      try {
        const uploaded = await uploadImageFile(files[i]);
        if (i === 0) {
          input.value = uploaded;
          input.dispatchEvent(new Event('input'));
        } else addPostPhoto(box, uploaded);
      } catch (err) {
        showFlash(err.message, false);
      }
    }
    if (files.length > 1) showFlash(`Завантажено фото: ${files.length}`);
    else if (files.length === 1) showFlash('Фото завантажено');
  });
  upload.append(input, button, file);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-danger';
  remove.textContent = 'Прибрати';
  remove.addEventListener('click', () => {
    const wasMain = pick.querySelector('input').checked;
    wrap.remove();
    if (wasMain) {
      const next = box.querySelector('[data-field="main"]');
      if (next) next.checked = true;
    }
  });
  wrap.append(preview, pick, upload, remove);
  box.append(wrap);
}

function addPostVideo(box, url = '') {
  const wrap = document.createElement('div');
  wrap.className = 'post-video-row';
  wrap.innerHTML = `<input data-field="video" value="${escapeAttr(url)}" placeholder="Посилання на YouTube або Instagram"><button type="button" class="btn btn-danger">Прибрати</button>`;
  wrap.querySelector('button').addEventListener('click', () => wrap.remove());
  box.append(wrap);
}

function collectPosts() {
  return [...document.querySelectorAll('#postsList .post-card')].map((card, i) => {
    const field = (name) => card.querySelector(`[data-field="${name}"]`);
    const photoRows = [...card.querySelectorAll('.post-photo')];
    const photos = photoRows.map((row) => row.querySelector('[data-field="photo"]').value.trim()).filter(Boolean);
    const picked = photoRows.find((row) => row.querySelector('[data-field="main"]')?.checked)
      ?.querySelector('[data-field="photo"]')?.value.trim();
    const videos = [...card.querySelectorAll('[data-field="video"]')].map((el) => el.value.trim()).filter(Boolean);
    return {
      id: Number(card.dataset.id) || undefined,
      kind: 'post',
      group_label: field('kind').value === 'video' ? 'video' : 'article',
      title: field('title').value.trim(),
      description: field('description').value.trim(),
      body: card._readBody ? card._readBody() : '',
      photos,
      videos,
      href: videos[0] || '',
      slug: card.dataset.slug || '',
      image: picked && photos.includes(picked) ? picked : photos[0] || '',
      published: field('published').checked ? 1 : 0,
      created_at: card.dataset.createdAt || '',
      sort_order: i,
    };
  });
}

async function loadPosts() {
  showView('posts', 'Статті');
  if (!sitePages.length) sitePages = await api('/pages');
  const brief = sitePages.find((item) => item.slug === 'statti');
  if (!brief) {
    showFlash('Сторінку статей не знайдено', false);
    return;
  }
  const page = await api(`/pages/${brief.id}`);
  postsPageId = page.id;
  const form = document.getElementById('postsForm');
  form.title.value = page.title || '';
  form.lead.value = page.lead || '';
  paintPosts(page);
}

document.getElementById('addPostBtn').addEventListener('click', () => {
  addPostCard({ published: 1, created_at: localStamp() }, true);
});

function paintPosts(saved, openCreatedAt = '') {
  document.getElementById('postsList').innerHTML = '';
  (saved.items || [])
    .filter((item) => item.kind === 'post')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .forEach((item) => addPostCard(item, false, Boolean(openCreatedAt) && item.created_at === openCreatedAt));
  refreshPostsEmpty();
}

async function persistPosts() {
  if (!postsPageId) return null;
  const form = document.getElementById('postsForm');
  return api(`/pages/${postsPageId}`, {
    method: 'PUT',
    body: {
      title: form.title.value.trim(),
      lead: form.lead.value.trim(),
      items: collectPosts(),
    },
  });
}

async function saveOnePost(card) {
  const title = card.querySelector('[data-field="title"]').value.trim();
  if (!title) {
    showFlash('У матеріалу має бути назва', false);
    return;
  }
  try {
    const saved = await persistPosts();
    paintPosts(saved, card.dataset.createdAt || '');
    const shown = collectPosts().filter((item) => item.published).length;
    showFlash(`Збережено. На сайті видно ${shown}.`);
  } catch (err) {
    showFlash(err.message, false);
  }
}

document.getElementById('postsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = collectPosts();
  if (items.some((item) => !item.title)) {
    showFlash('У кожного матеріалу має бути назва', false);
    return;
  }
  try {
    const saved = await persistPosts();
    paintPosts(saved);
    const shown = items.filter((item) => item.published).length;
    showFlash(`Збережено. На сайті видно ${shown}.`);
  } catch (err) {
    showFlash(err.message, false);
  }
});

await requireAuth();
loadCategories(true);
