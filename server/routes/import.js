import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { importProductsFromHtml } from '../import-html.js';
import { importPagesFromHtml } from '../import-pages.js';
import { syncSiteTree } from '../site-tree.js';

const router = Router();

router.post('/', requireAuth, (_req, res) => {
  try {
    const products = importProductsFromHtml();
    const pages = importPagesFromHtml();
    const tree = syncSiteTree();
    res.json({
      ok: true,
      ...products,
      pages: pages.imported,
      pageCards: pages.cards,
      pageModels: pages.models,
      pageGallery: pages.gallery,
      catalogRoots: tree.roots,
      categories: tree.categories,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
