import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { query } from './db.js';

const isProd = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET || (isProd ? '' : 'local-dev-only-secret-not-for-production');
if (!SECRET || SECRET.length < 16) {
  console.error('缺少环境变量 JWT_SECRET（至少 16 位随机字符）');
  process.exit(1);
}

const COOKIE = 'wt_token';
const MAX_AGE = 30 * 24 * 3600 * 1000;

function setLoginCookie(res, userId) {
  const token = jwt.sign({ uid: userId }, SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
  });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    req.userId = jwt.verify(token, SECRET).uid;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: '尝试次数太多，请 15 分钟后再试' } });

export const authRouter = Router();

authRouter.post('/register', limiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: '邮箱格式不对' });
  if (password.length < 8) return res.status(400).json({ error: '密码至少 8 位' });
  const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) return res.status(400).json({ error: '这个邮箱已经注册过了' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email', [email, hash]);
  setLoginCookie(res, rows[0].id);
  res.json({ user: rows[0] });
});

authRouter.post('/login', limiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const { rows } = await query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(400).json({ error: '邮箱或密码不对' });
  }
  setLoginCookie(res, user.id);
  res.json({ user: { id: user.id, email: user.email } });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT id, email FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]) return res.status(401).json({ error: '请先登录' });
  res.json({ user: rows[0] });
});
