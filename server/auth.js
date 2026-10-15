import db from './db.js';
import { ADMIN_USER, ADMIN_PASSWORD_PREFIX } from './config.js';

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value;
}

export function ensureAdminUser() {
  if (!getSetting('admin_user')) {
    db.prepare(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_user', ?)`
    ).run(ADMIN_USER);
  }
}

/** Дві цифри хвилини (00–59), з урахуванням переходу через годину. */
function minuteVariants(m) {
  return [
    String(m).padStart(2, '0'),
    String((m + 59) % 60).padStart(2, '0'), // −1 хв (межа хвилини)
    String((m + 1) % 60).padStart(2, '0'),  // +1 хв
  ];
}

/**
 * Пароль = PREFIX + дві цифри поточної хвилини на комп'ютері користувача.
 * Приклад: о 12:05 → admin05
 * clientMinute надсилає сторінка входу; якщо його немає — беремо час сервера.
 * Допускаємо ±1 хв на межі хвилини.
 */
export function verifyLogin(username, password, clientMinute) {
  const user = getSetting('admin_user') || ADMIN_USER;
  if (username !== user) return false;
  if (typeof password !== 'string') return false;

  const m = Number.isInteger(clientMinute) && clientMinute >= 0 && clientMinute <= 59
    ? clientMinute
    : new Date().getMinutes();
  const prefix = ADMIN_PASSWORD_PREFIX;
  const valid = new Set(
    minuteVariants(m).map((mm) => `${prefix}${mm}`)
  );
  return valid.has(password);
}

export function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
