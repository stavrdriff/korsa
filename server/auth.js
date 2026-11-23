import db from './db.js';
import { ADMIN_LOGIN, ADMIN_USER, ADMIN_PASSWORD_PREFIX } from './config.js';

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

const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1])(?::\d+)?$/i;

/** Запит із цього ж комп'ютера й зі сторінки самої адмінки (не з мережі й не з чужого сайту в браузері) */
function isLocalRequest(req) {
  const { host = '', origin } = req.headers;
  return LOCAL_ADDRESSES.has(req.socket.remoteAddress) && LOCAL_HOST.test(host) && (!origin || origin === `http://${host}`);
}

/** Вікно входу вимкнене й запит локальний — пароль не потрібен */
export const isLoginFree = (req) => !ADMIN_LOGIN && isLocalRequest(req);

/** Хто працює в адмінці (порожньо — треба увійти) */
export function currentUser(req) {
  return req.session?.user || (isLoginFree(req) ? ADMIN_USER : '');
}

export function requireAuth(req, res, next) {
  if (currentUser(req)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}
