# КОРСА — встановлення проєкту на хостингу

Цей гайд написано за результатами аналізу всього проєкту, крім папки `old/`. Нижче описано, що саме потрібно для роботи сайту, і дано три варіанти розгортання. Для кожного є покрокові команди.

---

## 1. Як влаштований проєкт

| Що | Де | Призначення |
|---|---|---|
| Публічний сайт | `public/*.html` (~75 сторінок), `public/sitemap.xml`, `public/robots.txt` | Готовий статичний HTML. Відвідувачі бачать саме його |
| Стилі та скрипт сайту | `assets/style.css`, `assets/script.js` | Підключаються зі сторінок відносним шляхом `assets/...` |
| Медіа | `img/` (**~740 МБ**: фото, відео mp4) | Підключаються як `img/...` |
| Адмінка (UI) | `admin/` (`index.html`, `login.html`, `js/`, `css/`) | Відкривається за адресою `/admin/` |
| Сервер (CMS) | `server/` — Node.js + Express 5 | REST API `/api/*`, генерація HTML, sitemap |
| База даних | `data/cms.sqlite` (+ `-wal`, `-shm`) | SQLite через `better-sqlite3` |
| Завантаження з адмінки | `data/uploads/` | Віддаються за адресою `/uploads/...` |
| Налаштування | `.env` (шаблон: `.env.example`) | Порт, домен, секрет сесій, логін |

### Як це працює

1. Сервер `node server/index.js` (команда `npm start`) запускає Express на порту `PORT` (за замовчуванням 3000). Сервер:
   - віддає `public/` як корінь сайту, а також `/assets`, `/img`, `/uploads` (з `data/uploads`), `/admin`;
   - обслуговує API `/api/auth`, `/api/categories`, `/api/products`, `/api/media`, `/api/publish`, `/api/import`, `/api/pages`;
   - **під час кожного запуску перезаписує** `public/sitemap.xml` і `public/robots.txt`. Домен для них береться з `SITE_URL`;
   - для `/old/*` завжди повертає 404.
2. Після кожного «Опублікувати» адмінка **генерує HTML-файли прямо в `public/`**: сторінки товарів, розділів, `statti.html` і `stattia-*.html`. Також вона видаляє застарілі `stattia-*.html`. Тому **сервер повинен мати право запису** в `public/` і `data/`.
3. «Імпорт» в адмінці (`/api/import`, `npm run db:import`) читає HTML **з папки `old/`**. На хостингу ця функція не потрібна, і папку `old/` туди можна не копіювати. Але якщо `old/` відсутня, кнопка «Імпорт» поверне помилку. Це нормально.
4. Вхід в адмінку працює так: логін `ADMIN_USER`, пароль `ADMIN_PASSWORD_PREFIX` + дві цифри **поточної хвилини за годинником сервера**. Наприклад, о 12:05 пароль буде `admin05`. Допускається відхилення ±1 хвилина. Сесії зберігаються в пам'яті процесу, тому після перезапуску сервера потрібно увійти знову.

### Залежності

- **Node.js 20 або новіший** (`"engines": { "node": ">=20" }`). Проєкт використовує ES-модулі (`"type": "module"`).
- `better-sqlite3`. Це **нативний модуль**, його потрібно встановлювати (`npm ci`) **на самому сервері**. Для Linux x64/arm64 (glibc) з Node 20/22 є готові бінарні збірки. На Alpine/musl або нестандартних системах потрібні `python3`, `make`, `g++`.
- Інші залежності: `express`, `express-session`, `multer`, `bcryptjs`, `dotenv`, `slugify`.
- Зовнішніх сервісів (пошта, Telegram, сторонні API) немає. Форм на сайті немає, зв'язок іде через `tel:` і `viber:`. Частина картинок і відео підвантажується з інших доменів (sunny-tm.com, YouTube тощо).

> ⚠️ **Ніколи не копіюйте `node_modules/` з Mac на сервер.** Там лежить бінарний файл `better-sqlite3` для macOS, і на Linux сервер не запуститься. На сервері завжди виконуйте `npm ci`.

---

## 2. Який варіант обрати

| Варіант | Коли підходить | Чи працює адмінка онлайн |
|---|---|---|
| **A. VPS + Node.js + Nginx + PM2** (рекомендовано) | Є VPS (Ubuntu/Debian) з root-доступом | Так, `https://домен/admin/` |
| **B. Shared-хостинг з cPanel «Setup Node.js App»** | Звичайний хостинг з підтримкою Node.js ≥ 20 | Так, але є обмеження |
| **C. Тільки статика** | Будь-який дешевий хостинг без Node.js | Ні: адмінка працює локально на Mac, на хостинг заливаються готові HTML |

---

## 3. Підготовка на Mac (для будь-якого варіанту)

### 3.1. Зафіксувати зміни в git (якщо деплой іде через git)

Зараз репозиторій не відповідає робочій папці. Папки `public/`, `server/`, `admin/`, `package.json` ще не закомічені, а старі HTML у корені позначені як видалені. Тому перед деплоєм через git виконайте:

```bash
cd /Users/timsolo/Corsa/korsa-site
git add -A
git status            # перевірте, що .env та data/*.sqlite НЕ потрапили до списку
git commit -m "CMS: public/, server/, admin/"
git push
```

`.gitignore` уже виключає `.env`, `data/*.sqlite*`, `data/uploads/*` і `node_modules/`. Тому **базу даних і завантаження потрібно переносити окремо** (див. 3.3).

Можна також додати в `.gitignore` рядки `.idea/` і `old/`, якщо ці папки не потрібні в репозиторії.

### 3.2. Згенерувати актуальні сторінки

```bash
npm run publish      # перегенерує сторінки з бази в public/
```

### 3.3. Підготувати базу даних до копіювання

У базі ввімкнено режим WAL. Частина даних може лежати у файлі `cms.sqlite-wal` (зараз він ~4 МБ). Перед копіюванням **зупиніть локальний сервер** (`Ctrl+C` у `npm run dev`) і злийте WAL в основний файл:

```bash
sqlite3 data/cms.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"
```

Після цього достатньо скопіювати лише `data/cms.sqlite`. Якщо утиліти `sqlite3` немає, копіюйте **всі три файли** `cms.sqlite`, `cms.sqlite-wal` і `cms.sqlite-shm` разом при зупиненому сервері.

### 3.4. Що завантажувати на хостинг

```
admin/  assets/  data/ (cms.sqlite + uploads/)  img/  public/  server/
package.json  package-lock.json  .env.example
```

**Не завантажувати:** `node_modules/`, `old/`, `.idea/`, `.git/` (якщо копіюєте через rsync), `.env` з Mac (на сервері створіть свій), `_tmp_*`, `_review_*`, `_icon_review/`, файли `*.jpg~` (сайт їх не використовує).

Папка `img/` займає ~740 МБ. Найзручніше завантажувати її через `rsync`: він докачує файли і передає лише змінені.

---

## 4. Варіант A — VPS (Ubuntu 22.04/24.04) + Nginx + PM2

Нижче приклад для домену `korsadnipro.in.ua` і папки `/var/www/korsa`.

### 4.1. Встановити програми на сервері

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git sqlite3 build-essential python3 rsync

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # має бути v22.x (мінімум v20)

sudo npm install -g pm2

# Синхронізація часу (від неї залежить пароль адмінки!)
sudo timedatectl set-ntp true
timedatectl            # має бути "System clock synchronized: yes"
```

### 4.2. Створити користувача та папку

```bash
sudo adduser --disabled-password --gecos "" korsa
sudo mkdir -p /var/www/korsa
sudo chown korsa:korsa /var/www/korsa
```

### 4.3. Завантажити файли

**Спосіб 1: rsync з Mac** (виконувати на Mac):

```bash
cd /Users/timsolo/Corsa/korsa-site
rsync -avz --progress \
  --exclude node_modules --exclude old --exclude .idea --exclude .git \
  --exclude .env --exclude '_tmp_*' --exclude '_review_*' --exclude '_icon_review' \
  --exclude '*.jpg~' --exclude 'data/cms.sqlite-*' --exclude .DS_Store \
  ./ korsa@IP_СЕРВЕРА:/var/www/korsa/
```

**Спосіб 2: git** (на сервері, від користувача `korsa`):

```bash
cd /var/www/korsa
git clone <URL_репозиторію> .
# базу копіюємо окремо з Mac:
#   scp data/cms.sqlite korsa@IP_СЕРВЕРА:/var/www/korsa/data/
```

### 4.4. Встановити залежності та налаштувати `.env`

```bash
sudo -iu korsa
cd /var/www/korsa
npm ci --omit=dev
cp .env.example .env
nano .env
```

Вміст `.env`:

```dotenv
PORT=3000
SITE_URL=https://korsadnipro.in.ua
# згенерувати: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_SECRET=<довгий_випадковий_рядок>
ADMIN_USER=<свій_логін_не_admin>
ADMIN_PASSWORD_PREFIX=<свій_префікс_не_admin>
```

Пояснення:
- `SITE_URL` задається **без** слеша в кінці. З нього будуються `sitemap.xml` і `robots.txt`.
- Логін береться з `ADMIN_USER` лише тоді, коли в базі ще немає ключа `admin_user` у таблиці `settings`. У перенесеній базі він уже записаний (`admin`). Щоб змінити логін, оновіть його в базі:
  ```bash
  sqlite3 data/cms.sqlite "UPDATE settings SET value='новий_логін' WHERE key='admin_user';"
  ```

Права на запис (сервер записує файли в `public/` і `data/`):

```bash
chmod -R u+rwX public data
mkdir -p data/uploads
chmod 600 .env
```

Якщо бази ще немає (чиста установка), створіть стартові дані:

```bash
npm run db:seed
```

### 4.5. Перевірити запуск

```bash
npm start
# КОРСА CMS → http://localhost:3000
# в іншому терміналі:  curl -I http://localhost:3000/
```

Зупиніть процес (`Ctrl+C`) і запустіть через PM2:

```bash
pm2 start server/index.js --name korsa --cwd /var/www/korsa
pm2 save
pm2 startup systemd -u korsa --hp /home/korsa
# виконайте команду, яку виведе pm2 startup (вона з sudo)
```

Корисні команди: `pm2 logs korsa`, `pm2 restart korsa`, `pm2 status`.

> Якщо замість PM2 вам зручніше systemd, ось юніт `/etc/systemd/system/korsa.service`:
> ```ini
> [Unit]
> Description=Korsa CMS
> After=network.target
>
> [Service]
> User=korsa
> WorkingDirectory=/var/www/korsa
> ExecStart=/usr/bin/node server/index.js
> Restart=always
> Environment=NODE_ENV=production
>
> [Install]
> WantedBy=multi-user.target
> ```
> Потім виконайте `sudo systemctl daemon-reload && sudo systemctl enable --now korsa`.

### 4.6. Налаштувати Nginx

Nginx сам віддає статику (HTML, `assets`, `img` з mp4), а Node обслуговує лише API, адмінку та `/uploads`. Створіть файл `/etc/nginx/sites-available/korsa`:

```nginx
server {
    listen 80;
    server_name korsadnipro.in.ua www.korsadnipro.in.ua;

    root /var/www/korsa/public;
    index index.html;

    client_max_body_size 15m;   # завантаження в адмінці до 12 МБ

    # Статика сайту
    location /assets/ {
        alias /var/www/korsa/assets/;
        expires 7d;
        access_log off;
    }
    location /img/ {
        alias /var/www/korsa/img/;
        expires 30d;
        access_log off;
    }
    location /uploads/ {
        alias /var/www/korsa/data/uploads/;
        expires 30d;
    }

    # Не віддавати службові файли
    location ~ /\.(?!well-known) { deny all; }
    location ^~ /old/ { return 404; }
    location ^~ /data/ { return 404; }
    location ^~ /server/ { return 404; }

    # Адмінка та API → Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;    # публікація всіх сторінок може тривати довго
    }
    location /admin {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Публічні сторінки
    location / {
        try_files $uri $uri/ =404;
    }

    gzip on;
    gzip_types text/css application/javascript application/xml image/svg+xml;
}
```

Активувати:

```bash
sudo ln -s /etc/nginx/sites-available/korsa /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Nginx (користувач `www-data`) повинен мати право читати файли:

```bash
sudo chmod o+rx /var/www/korsa /var/www/korsa/public /var/www/korsa/assets /var/www/korsa/img /var/www/korsa/data /var/www/korsa/data/uploads
sudo find /var/www/korsa/img /var/www/korsa/assets /var/www/korsa/public -type d -exec chmod o+rx {} \;
sudo find /var/www/korsa/img /var/www/korsa/assets /var/www/korsa/public -type f -exec chmod o+r {} \;
```

> Якщо вам простіше, можна проксувати весь сайт на Node, тобто зробити `location / { proxy_pass http://127.0.0.1:3000; }` для всього. Express сам віддасть усі файли. Це працює, але повільніше, особливо для відео.

### 4.7. DNS і HTTPS

1. У DNS домену створіть A-записи `@` і `www` з IP сервера.
2. Отримайте SSL-сертифікат:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d korsadnipro.in.ua -d www.korsadnipro.in.ua --redirect
   ```
   Certbot сам додасть блок `listen 443` і редірект з http на https. Сертифікат продовжується автоматично.

3. Брандмауер:
   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
   ```
   Порт 3000 назовні **не відкривайте**.

### 4.8. Захистити адмінку (дуже рекомендовано)

Пароль адмінки складається з префікса і двох цифр хвилини, тобто має лише 60 можливих варіантів. Обмеження на кількість спроб входу немає. Якщо зловмисник знає логін і префікс, підібрати пароль дуже легко. Додайте другий рубіж захисту на рівні Nginx:

```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.korsa_admin <логін>
```

Додайте в блоки `location /admin` і `location /api/`:

```nginx
auth_basic "Korsa admin";
auth_basic_user_file /etc/nginx/.korsa_admin;
```

Або дозвольте доступ лише зі своїх IP: `allow 1.2.3.4; deny all;`. Публічний сайт не використовує `/api`, тому таке обмеження на нього не вплине.

Також встановіть свої `ADMIN_USER` і `ADMIN_PASSWORD_PREFIX`, які відрізняються від `admin`.

---

## 5. Варіант B — shared-хостинг з cPanel (Node.js App / Passenger)

Підходить, якщо хостинг підтримує **Node.js ≥ 20**. Українські хостинги з такою опцією: Hostinger, Ukraine.com.ua (з Node.js), Adm.tools (Node.js-хостинг) та інші.

1. **Завантажте файли** через Файловий менеджер, FTP або `rsync`/SSH у папку поза `public_html`, наприклад `~/korsa`. Список файлів дивіться в п. 3.4.
2. **Створіть застосунок** у розділі cPanel → *Setup Node.js App* → *Create Application*:
   - Node.js version: **20 або 22**;
   - Application mode: `Production`;
   - Application root: `korsa`;
   - Application URL: ваш домен;
   - Application startup file: `server/index.js`.
3. **Змінні середовища.** Додайте їх у тому ж вікні (*Environment variables*) або створіть файл `~/korsa/.env` (див. 4.4). Змінну `PORT` у цьому варіанті **не вказуйте**, її задає Passenger.
4. Натисніть **Run NPM Install** або виконайте по SSH:
   ```bash
   source ~/nodevenv/korsa/22/bin/activate && cd ~/korsa
   npm ci --omit=dev
   ```
   Якщо `better-sqlite3` не збирається (немає компілятора), попросіть підтримку хостингу або оберіть варіант A чи C.
5. **ES-модулі.** Деякі версії Passenger не вміють запускати ESM-файл напряму. Якщо застосунок не стартує з помилкою `ERR_REQUIRE_ESM`, створіть файл `~/korsa/app.cjs`:
   ```js
   import('./server/index.js');
   ```
   і вкажіть `app.cjs` як *startup file*.
6. Перезапустіть застосунок (*Restart*) і відкрийте `https://домен/` та `https://домен/admin/`.
7. SSL налаштовується в розділі cPanel → *SSL/TLS Status* → *AutoSSL* (Let's Encrypt).

**Обмеження варіанта B:**
- Passenger може зупиняти процес, коли немає запитів, тож сесії адмінки іноді будуть «злітати». Просто увійдіть знову.
- Усю статику, включно з `img/` (740 МБ, відео), віддає Node. Це повільніше, ніж Nginx, тому перевірте ліміт диска на тарифі.
- Не можна закрити адмінку через Nginx basic-auth. Частина панелей дозволяє поставити пароль на папку (*Directory Privacy*), але для Node-застосунку це працює не завжди.

---

## 6. Варіант C — тільки статика (адмінка залишається на Mac)

Найпростіший і найдешевший варіант. Він зберігає підхід із `README-CMS.md`: сайт залишається статичним HTML. Підходить будь-який хостинг з PHP/HTML, Cloudflare Pages, Netlify і подібні.

### 6.1. Структура на хостингу

Публічні сторінки посилаються на `assets/...` та `img/...` відносним шляхом від кореня. Тому в корені сайту (`public_html/`) потрібно **зібрати разом**:

```
public_html/
├── index.html, catalog.html, ... (весь вміст public/)
├── sitemap.xml, robots.txt       (з public/)
├── assets/                       (папка assets/)
├── img/                          (папка img/)
└── uploads/                      (вміст data/uploads/, якщо там є файли)
```

### 6.2. Робочий процес після кожного редагування

На Mac:

```bash
cd /Users/timsolo/Corsa/korsa-site
npm run dev                   # редагуєте в http://localhost:3000/admin/ → «Опублікувати»
# або без адмінки:
npm run publish
```

Важливо: `sitemap.xml` і `robots.txt` створюються з `SITE_URL`. Додайте в локальний `.env` рядок:

```dotenv
SITE_URL=https://korsadnipro.in.ua
```

Завантаження на хостинг (по SSH):

```bash
rsync -avz --delete public/  user@host:public_html/ --exclude assets --exclude img --exclude uploads
rsync -avz assets/           user@host:public_html/assets/
rsync -avz --exclude '*.jpg~' img/  user@host:public_html/img/
rsync -avz --exclude .gitkeep data/uploads/ user@host:public_html/uploads/
```

Без SSH те саме можна зробити через FTP-клієнт (FileZilla). Після першого завантаження папки `img/` достатньо оновлювати лише `public/*.html`, `sitemap.xml` і змінені файли.

Мінусів два: редагувати сайт можна лише з Mac, на якому лежить база, і після кожної зміни потрібно завантажувати файли вручну.

---

## 7. Перевірка після розгортання

- [ ] `https://домен/` відкриває головну, стилі та фото завантажуються (у DevTools → Network немає 404 на `assets/` і `img/`).
- [ ] Відкриваються сторінки `catalog.html`, `shtory-plise.html` і будь-яка сторінка товару; відео mp4 програються.
- [ ] `https://домен/sitemap.xml` містить посилання з правильним доменом.
- [ ] `https://домен/robots.txt` містить рядок `Sitemap: https://домен/sitemap.xml`.
- [ ] `https://домен/old/` і `https://домен/.env` повертають 404 або 403.
- [ ] (A/B) Вхід у `/admin/` працює: логін і пароль = префікс + поточна хвилина **за часом сервера**.
- [ ] (A/B) Після зміни товару в адмінці і натискання «Опублікувати» зміни видно на сайті. Якщо їх не видно, перевірте права на запис у `public/`.
- [ ] (A/B) Завантаження зображення в адмінці працює і файл відкривається за адресою `/uploads/...`.

## 8. Оновлення та резервні копії

**Оновлення коду (варіант A):**

```bash
cd /var/www/korsa
git pull                 # або rsync з Mac
npm ci --omit=dev        # лише якщо змінився package-lock.json
pm2 restart korsa
```

Не перезаписуйте `data/cms.sqlite` на сервері базою з Mac, якщо редагування вже ведеться онлайн: так можна втратити зміни. Якщо деплоїте через rsync, додайте `--exclude data/` і `--exclude public/`, бо `public/` генерується на сервері.

**Резервні копії бази.** Додайте в crontab користувача `korsa` (`crontab -e`):

```cron
0 3 * * * sqlite3 /var/www/korsa/data/cms.sqlite ".backup '/home/korsa/backup/cms-$(date +\%F).sqlite'" && find /home/korsa/backup -name 'cms-*.sqlite' -mtime +30 -delete
```

(спочатку виконайте `mkdir -p /home/korsa/backup`). Також періодично архівуйте `data/uploads/` і `public/`.

## 9. Типові проблеми

| Симптом | Причина та рішення |
|---|---|
| `Error: ... better_sqlite3.node ... invalid ELF header` | `node_modules` скопійовано з Mac. Видаліть папку і виконайте `npm ci` на сервері |
| `gyp ERR!` під час `npm ci` | Немає компілятора: `sudo apt install build-essential python3` або використайте Node 20/22 LTS (для них є готові збірки) |
| `SyntaxError: Cannot use import statement` / `ERR_REQUIRE_ESM` | Node старіший за 20 або Passenger не підтримує ESM. Оновіть Node або використайте `app.cjs` (див. п. 5) |
| Не вдається увійти в адмінку | Пароль залежить від хвилини **на сервері**. Перевірте `date` на сервері і синхронізацію NTP. Логін береться з бази (`settings.admin_user`), а не з `.env` |
| «Опублікувати» повертає помилку `EACCES` | Процес Node не має права запису в `public/` або `data/`. Виконайте `chown -R korsa:korsa public data` |
| Сайт без стилів і картинок (варіант C) | `assets/` та `img/` не лежать поруч із HTML у корені сайту |
| 413 Request Entity Too Large під час завантаження фото | Збільшіть `client_max_body_size` у Nginx |
| Сесія адмінки злітає | Сесії зберігаються в пам'яті й зникають після перезапуску. Увійдіть знову |
| У sitemap стоїть неправильний домен | Виправте `SITE_URL` у `.env` і перезапустіть сервер (sitemap перезаписується під час старту) |

## 10. Рекомендації на майбутнє (не обов'язкові для запуску)

- Додати в `server/index.js` обмеження кількості спроб входу (наприклад, `express-rate-limit` на `/api/auth/login`) і перейти на нормальний пароль. Пакет `bcryptjs` уже є в залежностях, але зараз не використовується.
- Для HTTPS встановити `app.set('trust proxy', 1)` і `cookie.secure: true` у налаштуваннях сесії.
- Замінити `MemoryStore` сесій на постійне сховище (наприклад, на основі SQLite), щоб вхід не злітав після перезапуску.
- Оновити `README-CMS.md`: генерація відбувається в `public/`, а не в корінь проєкту. До `.env` на Mac додати `SITE_URL`.
