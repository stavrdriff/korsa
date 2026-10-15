#!/usr/bin/env bash
# Готує сайт до заливки на cPanel-хостинг (Setup Node.js App).
#
#   npm run pack:hosting               → deploy/korsa/  (папка для заливки по FTP)
#   npm run pack:hosting -- --archives → ще й deploy/korsa-app.tar.gz + deploy/korsa-img.tar
#
# У deploy/korsa/ лежить усе потрібне: код, адмінка, сторінки, картинки (без
# невикористовуваних *.jpg~), копія бази та .env. node_modules НЕ кладемо —
# cPanel ставить залежності сам кнопкою «Run NPM Install».
#
# .env для хостингу береться з .env.hosting; якщо його немає — створюється
# з новим SESSION_SECRET. Файл .env.hosting у git не потрапляє.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy"
APP="$OUT/korsa"
export COPYFILE_DISABLE=1 # без службових ._* файлів macOS

ARCHIVES=0
[ "${1:-}" = "--archives" ] && ARCHIVES=1

cd "$ROOT"

if [ ! -f .env.hosting ]; then
  secret="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
  cat > .env.hosting <<EOF
# .env для хостингу. PORT не задаємо — його визначає Passenger.
SITE_URL=https://korsadnipro.in.ua
SESSION_SECRET=$secret
ADMIN_USER=valkorsaadmin
# Пароль = цей префікс + дві цифри хвилини на комп'ютері користувача (о 12:05 → korsa05)
ADMIN_PASSWORD_PREFIX=korsa
EOF
  echo "Створено .env.hosting — перевірте SITE_URL перед заливкою."
fi

rm -rf "$OUT"
mkdir -p "$APP/data/uploads"

echo "→ Копіюю файли застосунку"
rsync -a --exclude .DS_Store \
  admin assets public server \
  app.cjs package.json package-lock.json DEPLOY.md \
  "$APP/"
rsync -a --exclude .gitkeep --exclude .DS_Store data/uploads/ "$APP/data/uploads/"
cp .env.hosting "$APP/.env"

echo "→ Знімаю копію бази (без зупинки локального сервера)"
sqlite3 data/cms.sqlite ".backup '$APP/data/cms.sqlite'"
sqlite3 "$APP/data/cms.sqlite" "PRAGMA journal_mode=DELETE;" >/dev/null
rm -f "$APP"/data/cms.sqlite-*
echo "   integrity: $(sqlite3 "$APP/data/cms.sqlite" 'PRAGMA integrity_check;')"

echo "→ Копіюю картинки та відео (займе хвилину)"
rsync -a --exclude '*.jpg~' --exclude .DS_Store img "$APP/"

if [ "$ARCHIVES" = 1 ]; then
  echo "→ Пакую архіви"
  tar -czf "$OUT/korsa-app.tar.gz" -C "$APP" --exclude ./img .
  tar -cf "$OUT/korsa-img.tar" -C "$APP" img
fi

echo
echo "Готово: $APP"
echo "   файлів: $(find "$APP" -type f | wc -l | tr -d ' '), розмір: $(du -sh "$APP" | cut -f1)"
[ "$ARCHIVES" = 1 ] && ls -lh "$OUT"/*.tar* || true
