import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'cms.sqlite');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const ARCHIVE_DIR = path.join(ROOT, 'old');

export const SITE_URL = String(process.env.SITE_URL || 'https://korsadnipro.in.ua').replace(/\/$/, '');
export const PORT = Number(process.env.PORT) || 3000;
export const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';
export const ADMIN_USER = process.env.ADMIN_USER || 'admin';
/** Префікс динамічного пароля: admin + дві цифри хвилини (напр. admin05) */
export const ADMIN_PASSWORD_PREFIX = process.env.ADMIN_PASSWORD_PREFIX || 'admin';
