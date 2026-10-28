/** Спільні фрагменти HTML — відповідають поточній верстці КОРСА */

/** Лого — картинка з alt, щоб назву бачили пошукові системи */
export const LOGO_IMG = `<img class="brand__logo" src="img/logo.jpg" alt="Корса — вікна, двері, ролети" width="240" height="68">`;

export function headerHtml() {
  return `<header class="header">
  <div class="header__inner">
    <a href="index.html" class="brand">${LOGO_IMG}</a>
    <button class="burger">☰</button>
    <nav class="nav">
      <ul class="nav__list">
        <li><a href="index.html">Головна</a></li>
        <li><a href="catalog.html">Каталог товарів</a></li>
        <li><a href="statti.html">Корисні статті та відео</a></li>
        <li><a href="contacts.html">Контакти</a></li>
        <li><a href="tel:+380677712359" class="cta-phone">📞 067 771-23-59</a></li>
      </ul>
    </nav>
  </div>
</header>`;
}

export function footerHtml() {
  return `<footer class="footer">
  <div class="footer__inner">
    <div><div class="brand" style="margin-bottom:14px">${LOGO_IMG}</div></div>
    <div><h5>Каталог</h5><ul><li><a href="dveri.html">Двері</a></li><li><a href="rolety.html">Зовнішній захист</a></li><li><a href="vikna.html">Вікна</a></li><li><a href="shtory.html">Штори</a></li></ul></div>
    <div><h5>Контакти</h5><ul><li><a href="tel:+380677712359">067 771-23-59</a></li><li><a href="viber://chat?number=%2B380677712359">Viber</a></li><li><a href="https://t.me/+380677712359">Telegram</a></li><li><a href="https://wa.me/380677712359">WhatsApp</a></li></ul></div>
  </div>
  <div class="footer__bottom"><span>© 2026 Корса. Дніпро · Обухівка</span></div>
</footer>`;
}

export const PRODUCT_PAGE_CSS = `
  .product-page{display:grid;grid-template-columns:1.1fr 1fr;gap:32px;margin:24px 0}
  @media (max-width:880px){.product-page{grid-template-columns:1fr}}
  .pp-main-img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:14px;border:1px solid var(--line);background:#fafaf7}
  .pp-thumbs{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:10px}
  .pp-thumbs img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:6px;border:1px solid var(--line);cursor:pointer;transition:all .15s}
  .pp-thumbs img:hover{border-color:var(--accent);transform:scale(1.05)}
  .pp-actions{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}
  .pp-actions a{padding:10px 18px;background:#fff;border:1px solid var(--accent);border-radius:8px;color:var(--accent);font-weight:600;font-size:13.5px;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
  .pp-actions a:hover{background:var(--accent);color:white}
  .pp-actions a.primary{background:var(--accent);color:white}
  .pp-actions a.primary:hover{background:#1e3a5f;border-color:#1e3a5f}
  .pp-desc{font-size:14.5px;color:#444;line-height:1.65;margin:0 0 18px;white-space:pre-line}
  .pp-details ul{margin:0 0 18px;padding-left:20px;font-size:14px;color:#444;line-height:1.6}
  .pp-details p{font-size:12.5px;color:var(--muted);margin-top:14px}
  .pp-table{width:100%;border-collapse:collapse;margin:18px 0;background:white;border-radius:10px;overflow:hidden;border:1px solid var(--line)}
  .pp-table th,.pp-table td{padding:12px 16px;text-align:left;border-bottom:1px solid var(--line);font-size:14px}
  .pp-table th{background:#f4f7fc;color:#1e3a5f;width:40%;font-weight:600}
  .pp-table tr:last-child th,.pp-table tr:last-child td{border-bottom:0}
  .video-link{display:block;position:relative;border-radius:10px;overflow:hidden;text-decoration:none;border:1px solid var(--line);margin:14px 0;max-width:340px}
  .video-link img{width:100%;display:block}
  .video-link .play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.25);transition:all .2s}
  .video-link .play::before{content:"";width:0;height:0;border-left:24px solid white;border-top:16px solid transparent;border-bottom:16px solid transparent;filter:drop-shadow(0 2px 8px rgba(0,0,0,.4));margin-left:6px}
  .video-link:hover .play{background:rgba(0,0,0,.35)}
  .video-link .label{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(180deg,transparent,rgba(0,0,0,.7));color:white;padding:14px 12px 10px;font-size:12.5px;font-weight:500}
`;
