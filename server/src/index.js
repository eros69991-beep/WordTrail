import './env.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from './db.js';
import { authRouter } from './auth.js';
import { api } from './routes.js';
import { MOCK } from './ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1); // Railway 前面有一层代理
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

// 生产环境：同一个服务直接托管前端打包好的文件
const dist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/.*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '内容太大了' });
  console.error(err);
  res.status(500).json({ error: '服务器出错了' });
});

const port = Number(process.env.PORT || 3000);
await migrate();
app.listen(port, () => {
  console.log(`WordTrail 运行在 http://localhost:${port}${MOCK ? '（AI 模拟模式：未配置 DEEPSEEK_API_KEY）' : ''}`);
});
