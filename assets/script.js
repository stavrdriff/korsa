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

  // Lightbox: article photos and gallery tiles
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
  document.querySelectorAll('.gallery__item, .post-shot').forEach((item) => {
    item.addEventListener('click', (e) => {
      const img = item.querySelector('img');
      if (!img) return;
      e.preventDefault();
      const group = item.closest('.post-gallery, .gallery') || item.parentElement;
      frames = [...group.querySelectorAll('.post-shot img, .gallery__item img')];
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
