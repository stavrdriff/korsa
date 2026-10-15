import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { publishAllPages } from '../builder/pages.js';
import { publishAllProducts, writeProductPage } from '../builder/product.js';

const router = Router();

router.post('/', requireAuth, (_req, res) => {
  try {
    const pages = publishAllPages();
    const products = publishAllProducts();
    res.json({ ok: true, pages: pages.length, products: products.length, results: products });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/product/:id', requireAuth, (req, res) => {
  try {
    const result = writeProductPage(Number(req.params.id));
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
