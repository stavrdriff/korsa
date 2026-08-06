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
        .replace(/(\d[\d\s ]*\d|\d)\s*грн\s*РРЦ/i, '<strong>від $1 грн</strong>')
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

  // Lightbox for fabric / pillow gallery items
  let lightbox = document.getElementById('lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    lightbox.innerHTML = '<button class="lightbox__close" aria-label="Закрити">✕</button><img alt="">';
    document.body.appendChild(lightbox);
  }
  const lbImg = lightbox.querySelector('img');
  document.querySelectorAll('.gallery__item').forEach(item => {
    item.addEventListener('click', () => {
      const img = item.querySelector('img');
      if (!img) return;
      lbImg.src = img.src;
      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  });
  lightbox.addEventListener('click', () => {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && lightbox.classList.contains('active')) {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
});
