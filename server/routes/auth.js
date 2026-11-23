import { Router } from 'express';
import { currentUser, isLoginFree, verifyLogin } from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password, clientMinute } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Вкажіть логін і пароль' });
  }
  if (!verifyLogin(username, password, clientMinute)) {
    return res.status(401).json({ error: 'Невірний логін або пароль' });
  }
  req.session.user = username;
  res.json({ ok: true, user: username });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  // Без вікна входу кнопка «Вийти» не потрібна
  res.json({ user, canLogout: !isLoginFree(req) });
});

export default router;
