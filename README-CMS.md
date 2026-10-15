# КОРСА CMS (локально на Mac)

Самописна адмінка на Node.js. Публічний сайт лишається статичним HTML (PageSpeed як раніше).

## Старт

```bash
cd /Users/timsolo/Corsa/korsa-site
cp .env.example .env   # якщо ще немає .env
npm install
npm run db:seed
npm run dev
```

- Сайт: http://localhost:3000/
- Адмінка: http://localhost:3000/admin/
- Логін: `admin`
- Пароль: `admin` + дві цифри поточної хвилини (о 12:05 → `admin05`)

## Що робить «Опублікувати»

Генерує `{slug}.html` у корені проєкту з даних SQLite (`data/cms.sqlite`), у тому ж стилі, що й ручна верстка product-page.

```bash
npm run publish
```

## Структура

```
admin/          — UI адмінки
server/         — Express API + builder
data/           — SQLite + uploads
assets/, *.html — публічний сайт (без змін підходу)
```
