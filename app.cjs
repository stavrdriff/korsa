// Точка входу для cPanel «Setup Node.js App» (Phusion Passenger).
// Passenger підвантажує startup-файл через require(), а сервер написаний як ES-модуль,
// тому тут лише динамічний import. Локально запускайте як і раніше: npm start / npm run dev.
import('./server/index.js').catch((err) => {
  console.error(err);
  process.exit(1);
});
