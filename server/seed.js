import db from './db.js';
import { ADMIN_USER } from './config.js';

const count = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
if (count > 0) {
  console.log('Seed пропущено — БД уже має дані.');
  process.exit(0);
}

const insertCat = db.prepare(`
  INSERT INTO categories (slug, title, description, sort_order)
  VALUES (@slug, @title, @description, @sort_order)
`);

const cats = [
  { slug: 'shtory', title: 'Штори · Жалюзі · Тканини', description: 'Римські, вертикальні, плісе, деревʼяні жалюзі.', sort_order: 1 },
  { slug: 'shtory-plise', title: 'Штори Плісе', description: '27 моделей SUNNY TM.', sort_order: 2 },
  { slug: 'dveri', title: 'Двері', description: 'Міжкімнатні, вхідні, приховані.', sort_order: 3 },
  { slug: 'rolety', title: 'Ролети', description: 'Захисні та сонцезахисні системи.', sort_order: 4 },
  { slug: 'vikna', title: 'Вікна', description: 'WDS та REHAU.', sort_order: 5 },
];

const tx = db.transaction(() => {
  for (const c of cats) insertCat.run(c);

  const plisse = db.prepare(`SELECT id FROM categories WHERE slug = 'shtory-plise'`).get();

  const productId = db.prepare(`
    INSERT INTO products (
      slug, category_id, title, subtitle, description, badge,
      cover_image, video_url, video_poster,
      parent_link, parent_label, meta_title, meta_description, published
    ) VALUES (
      @slug, @category_id, @title, @subtitle, @description, @badge,
      @cover_image, @video_url, @video_poster,
      @parent_link, @parent_label, @meta_title, @meta_description, 1
    )
  `).run({
    slug: 'plisse-jm-ab-62',
    category_id: plisse.id,
    title: 'Plisse JM AB-62',
    subtitle: 'Партнер SUNNY TM · Штори Плісе',
    description:
      'Нестандартна система JM для вертикальних вікон нестандартної форми. Повна палітра кольорів — білий, коричневий, металік, чорний. Управління ручкою.',
    badge: 'повна палітра',
    cover_image:
      'https://sunny-tm.com/image/cache/catalog/PLISSE/PlisseJM/AB-62-800x800.jpg',
    video_url: 'https://www.youtube.com/watch?v=GrqcmvFlMdk',
    video_poster: 'https://img.youtube.com/vi/GrqcmvFlMdk/hqdefault.jpg',
    parent_link: 'shtory-plise.html',
    parent_label: 'Штори Плісе',
    meta_title: 'Plisse JM AB-62 — штори плісе | Корса',
    meta_description:
      'Plisse JM AB-62 — нестандартної форми, монтаж на стулку, керування ручка. Кольори: білий, коричневий, металік, чорний. Партнер SUNNY TM.',
  }).lastInsertRowid;

  const specs = [
    ['Тип вікна', 'нестандартної форми'],
    ['Вид монтажу', 'на стулку'],
    ['Управління', 'ручка'],
    ['Кольори системи', 'білий, коричневий, металік, чорний'],
    ['Розміри', 'за розміром вікна (індивідуально)'],
    ['Країна виробник', 'Нідерланди / Польща'],
  ];

  const insertSpec = db.prepare(`
    INSERT INTO product_specs (product_id, label, value, sort_order)
    VALUES (?, ?, ?, ?)
  `);
  specs.forEach(([label, value], i) => insertSpec.run(productId, label, value, i));

  db.prepare(
    `INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_user', ?)`
  ).run(ADMIN_USER);
  db.prepare(
    `INSERT OR REPLACE INTO settings (key, value) VALUES ('phone', ?)`
  ).run('+380677712359');
  db.prepare(
    `INSERT OR REPLACE INTO settings (key, value) VALUES ('phone_display', ?)`
  ).run('067 771-23-59');
});

tx();
console.log('Seed OK. Логін:', ADMIN_USER, '/ пароль: admin + дві цифри хвилини');
