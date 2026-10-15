import { Router } from 'express';
import { verifyLogin } from '../auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Вкажіть логін і пароль' });
  }
  if (!verifyLogin(username, password)) {
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
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: req.session.user });
});

export default router;
