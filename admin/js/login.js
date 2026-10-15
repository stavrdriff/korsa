import { api } from './api.js';

const form = document.getElementById('loginForm');
const msg = document.getElementById('msg');

api('/auth/me')
  .then(() => {
    location.href = '/admin/';
  })
  .catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.className = 'msg hidden';
  const username = form.username.value.trim();
  const password = form.password.value;
  try {
    await api('/auth/login', {
      method: 'POST',
      // Хвилина за годинником комп'ютера користувача — пароль звіряється з нею
      body: { username, password, clientMinute: new Date().getMinutes() },
    });
    location.href = '/admin/';
  } catch (err) {
    msg.textContent = err.message || 'Помилка входу';
    msg.className = 'msg msg--err';
  }
});
