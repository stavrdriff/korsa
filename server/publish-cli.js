import { publishAllPages } from './builder/pages.js';
import { publishAllProducts } from './builder/product.js';

const pages = publishAllPages();
console.log(`Сторінок: ${pages.length}`);
for (const page of pages) console.log(' -', page.slug);

const products = publishAllProducts();
console.log(`Товарів: ${products.length}`);
for (const product of products) console.log(' -', product.slug, product.skipped ? '(пропущено)' : '');
