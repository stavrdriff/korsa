import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import {
  PORT,
  SESSION_SECRET,
  PUBLIC_DIR,
  UPLOADS_DIR,
  ROOT,
} from './config.js';
import { ensureAdminUser } from './auth.js';
import './db.js';

import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import productRoutes from './routes/products.js';
import mediaRoutes from './routes/media.js';
import publishRoutes from './routes/publish.js';
import importRoutes from './routes/import.js';
import pageRoutes from './routes/pages.js';
import { writeSitemap } from './sitemap.js';

ensureAdminUser();
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const app = express();

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/publish', publishRoutes);
app.use('/api/import', importRoutes);
app.use('/api/pages', pageRoutes);

app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/admin', express.static(path.join(ROOT, 'admin')));
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(ROOT, 'admin', 'index.html'));
});

// Архів старих HTML не віддається і на нього немає посилань
app.use('/old', (_req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.use('/img', express.static(path.join(ROOT, 'img')));
app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

writeSitemap();

app.listen(PORT, () => {
  console.log(`КОРСА CMS → http://localhost:${PORT}`);
  console.log(`Адмінка   → http://localhost:${PORT}/admin/`);
  console.log(`Логін: див. .env (ADMIN_USER / ADMIN_PASSWORD)`);
});
