// Корса site — interactivity
document.addEventListener('DOMContentLoaded', () => {
  // Price formatting: hide wholesale ("гурт"/"опт"), prepend "від" to РРЦ
  document.querySelectorAll('.product__price').forEach(el => {
    const text = el.textContent;
    if (/(гурт|опт)/i.test(text)) {
      el.style.display = 'none';
      return;
    }
    if (text.includes('РРЦ')) {
      // "X грн РРЦ" → "від X грн"
      el.innerHTML = el.innerHTML
        .replace(/(\d[\d\s\u00a0]*\d|\d)\s*грн\s*РРЦ/i, '<strong>від $1 грн</strong>')
        .replace(/<span[^>]*>\s*РРЦ\s*<\/span>/i, '');
      // Remove the leading <span> if it was leftover from the original split layout
    }
  });

  // Mobile nav toggle
  const burger = document.querySelector('.burger');
  const nav = document.querySelector('.nav');
  if (burger && nav) burger.addEventListener('click', () => nav.classList.toggle('open'));

  // Шапка виїжджає згори слідом за скролом, коли прокрутили більше ніж на висоту екрана
  const header = document.querySelector('.header');
  if (header) {
    const updateHeader = () => {
      const scrolled = window.scrollY - window.innerHeight;
      const revealed = scrolled > 0;
      if (!revealed && nav) nav.classList.remove('open');
      header.classList.toggle('header--revealed', revealed);
      if (revealed) header.style.setProperty('--header-scrolled', `${scrolled}px`);
    };
    window.addEventListener('scroll', updateHeader, { passive: true });
    window.addEventListener('resize', updateHeader, { passive: true });
    updateHeader();
    // Дотик поза шапкою згортає меню, сама шапка лишається.
    // pointerup, а не click: iOS не шле click із неклікабельних елементів, а прокрутка дає pointercancel
    document.addEventListener('pointerup', (e) => {
      if (nav && !header.contains(e.target)) nav.classList.remove('open');
    });
  }

  // Футер на телефоні: «Каталог» і «Сервіс» згорнуті, контакти завжди видно.
  // На ширших екранах кнопка вимкнена, а списки відкриті
  // Відкритий завжди лише один розділ, скільки б їх не було
  const FOOTER_PHONE_WIDTH = 780;
  const footerAccordions = [];
  document.querySelectorAll('.footer__inner > div').forEach((col) => {
    const title = col.querySelector('h2');
    if (!title || col.querySelector('a[href^="tel:"]')) return;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'footer__toggle';
    toggle.textContent = title.textContent;
    title.replaceChildren(toggle);
    col.classList.add('footer__col--accordion');
    const sync = () => {
      const phone = window.innerWidth <= FOOTER_PHONE_WIDTH;
      toggle.disabled = !phone;
      if (phone) toggle.setAttribute('aria-expanded', String(col.classList.contains('is-open')));
      else toggle.removeAttribute('aria-expanded');
    };
    footerAccordions.push({ col, sync });
    toggle.addEventListener('click', () => {
      const opening = !col.classList.contains('is-open');
      footerAccordions.forEach((item) => {
        item.col.classList.toggle('is-open', opening && item.col === col);
        item.sync();
      });
    });
    window.addEventListener('resize', sync, { passive: true });
    sync();
  });

  // Highlight active nav link
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });

  // Smooth scroll for in-page anchors
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id.length > 1) {
        const t = document.querySelector(id);
        if (t) { e.preventDefault(); t.scrollIntoView({behavior: 'smooth', block: 'start'}); }
      }
    });
  });

  // Gallery: show more / show less
  document.querySelectorAll('.gallery-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const collapsed = target.classList.toggle('gallery--collapsed');
      btn.textContent = collapsed
        ? `Показати всі (${target.children.length})`
        : 'Згорнути ↑';
    });
  });

  // Відео в галереях: мишкою — грає при наведенні, дотиком — тап запускає / зупиняє.
  // Вбудовані onmouseover/onmouseout прибираємо: на iPhone тап теж дає «наведення» і плутав би запуск.
  document.querySelectorAll('.gallery__item video').forEach(video => {
    const tile = video.closest('.gallery__item');
    video.onmouseover = null;
    video.onmouseout = null;
    const stop = () => { video.pause(); video.currentTime = 0; };
    tile.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') video.play(); });
    tile.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') stop(); });
    tile.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      if (video.paused) video.play();
      else video.pause();
    });
  });

  // Video cards: replace poster with native video on click
  document.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', () => {
      if (card.classList.contains('playing')) return;
      const src = card.dataset.video;
      if (!src) return;
      const v = document.createElement('video');
      v.src = src;
      v.controls = true;
      v.autoplay = true;
      v.preload = 'metadata';
      v.playsInline = true;
      const img = card.querySelector('img');
      if (img) img.replaceWith(v);
      card.classList.add('playing');
    });
  });

  // Lightbox: article photos, gallery tiles and fabric colour swatches
  let lightbox = document.getElementById('lightbox');
  if (!lightbox || !lightbox.querySelector('.lightbox__nav')) {
    if (lightbox) lightbox.remove();
    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    lightbox.innerHTML = '<button type="button" class="lightbox__close" aria-label="Закрити">✕</button><button type="button" class="lightbox__nav lightbox__nav--prev" aria-label="Попереднє">‹</button><img alt=""><button type="button" class="lightbox__nav lightbox__nav--next" aria-label="Наступне">›</button>';
    document.body.appendChild(lightbox);
  }
  const lbImg = lightbox.querySelector('img');
  const prevBtn = lightbox.querySelector('.lightbox__nav--prev');
  const nextBtn = lightbox.querySelector('.lightbox__nav--next');
  let frames = [];
  let index = 0;
  const show = (i) => {
    if (!frames.length) return;
    index = (i + frames.length) % frames.length;
    const img = frames[index];
    // Мініатюра могла завантажити зменшену копію — у лайтбоксі показуємо найбільшу зі srcset
    const largest = img.srcset ? img.srcset.split(',').pop().trim().split(/\s+/)[0] : '';
    lbImg.src = largest || img.currentSrc || img.src;
    lbImg.alt = img.alt || '';
    const many = frames.length > 1;
    prevBtn.hidden = !many;
    nextBtn.hidden = !many;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  };
  document.querySelectorAll('.gallery__item, .post-shot, .color-card, .review__shot').forEach((item) => {
    item.addEventListener('click', (e) => {
      const img = item.querySelector('img');
      if (!img) return;
      e.preventDefault();
      const group = item.closest('.post-gallery, .gallery, .colors-grid, .reviews') || item.parentElement;
      frames = [...group.querySelectorAll('.post-shot img, .gallery__item img, .color-card img, .review__shot img')];
      show(Math.max(0, frames.indexOf(img)));
    });
  });
  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); show(index - 1); });
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); show(index + 1); });
  lightbox.querySelector('.lightbox__close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
  lbImg.addEventListener('click', (e) => e.stopPropagation());
  lightbox.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  });

  // Відео в статтях: справжній плеєр YouTube / Instagram підставляємо лише після кліку по прев'ю
  document.querySelectorAll('.post-video__facade').forEach(btn => {
    btn.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = btn.dataset.embed;
      frame.title = btn.getAttribute('aria-label') || '';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      frame.allowFullscreen = true;
      btn.replaceWith(frame);
    });
  });
});
