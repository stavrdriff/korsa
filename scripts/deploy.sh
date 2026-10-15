#!/usr/bin/env bash
# Готує сайт до заливки на cPanel-хостинг (Setup Node.js App).
#
#   npm run deploy               → deploy/korsa/ (папка для FTP) + deploy/korsa.zip (для передачі)
#   npm run deploy -- --no-zip   → лише папка deploy/korsa/
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

ZIP=1
[ "${1:-}" = "--no-zip" ] && ZIP=0

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

if [ "$ZIP" = 1 ]; then
  echo "→ Пакую korsa.zip"
  # Python, а не zip з macOS: він позначає кириличні імена як UTF-8,
  # інакше на Windows вони розпакуються «кракозябрами».
  (cd "$OUT" && python3 -I - <<'EOF'
import os, sys, zipfile, unicodedata
media = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4')
with zipfile.ZipFile('korsa.zip', 'w', allowZip64=True) as z:
    for root, dirs, files in os.walk('korsa'):
        dirs.sort()
        for f in sorted(files):
            p = os.path.join(root, f)
            comp = zipfile.ZIP_STORED if f.lower().endswith(media) else zipfile.ZIP_DEFLATED
            z.write(p, unicodedata.normalize('NFC', p), compress_type=comp)
        if not files and not dirs:  # порожні теки (data/uploads)
            z.writestr(unicodedata.normalize('NFC', root) + '/', '')
with zipfile.ZipFile('korsa.zip') as z:
    bad = z.testzip()
    if bad:
        sys.exit(f'Пошкоджений файл в архіві: {bad}')
    if 'korsa/.env' not in z.namelist():
        sys.exit('В архіві немає .env')
EOF
  )
fi

echo
echo "Готово: $APP"
echo "   файлів: $(find "$APP" -type f | wc -l | tr -d ' '), розмір: $(du -sh "$APP" | cut -f1)"
[ "$ZIP" = 1 ] && echo "Архів:  $OUT/korsa.zip ($(du -h "$OUT/korsa.zip" | cut -f1))" || true
