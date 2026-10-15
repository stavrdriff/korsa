import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { UPLOADS_DIR } from '../config.js';

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '_')
      .toLowerCase();
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) {
      return cb(new Error('Дозволені лише зображення'));
    }
    cb(null, true);
  },
});

const router = Router();

router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не передано' });
  const urlPath = `/uploads/${req.file.filename}`;
  res.status(201).json({
    path: urlPath,
    filename: req.file.filename,
    size: req.file.size,
  });
});

router.get('/', requireAuth, (_req, res) => {
  const files = fs
    .readdirSync(UPLOADS_DIR)
    .filter((f) => f !== '.gitkeep')
    .map((f) => ({
      filename: f,
      path: `/uploads/${f}`,
      size: fs.statSync(path.join(UPLOADS_DIR, f)).size,
    }))
    .sort((a, b) => b.filename.localeCompare(a.filename));
  res.json(files);
});

export default router;
