# WordTrail

读真实的英文新闻和技术文档，逐句对照翻译；点单词查音标、释义、例句，一键收进当天的学习集。

## 第一版功能

- 注册 / 登录（邮箱 + 密码），每个人的数据互相隔离
- 导入文章：网址（自动提取正文）、粘贴文本、上传 .txt / .md
- 逐句对照翻译（DeepSeek），代码块不翻译，技术术语保留英文
- 一键隐藏译文；隐藏时点一句可以单独看
- 点单词：音标、发音、常见释义、例句，收藏到「今日学习」
- 收藏句子：句子后面的 ☆，或划选一段文字后点「收藏选中内容」
- 学习集：每天自动一个，可改名、新建、删除；条目可加入多个学习集
- 每个条目可标「新学 / 待复习 / 已掌握」，按状态查看全部
- 「遮住中文自测」
- 发音：美音 / 英音、语速可调（浏览器自带朗读，免费）
- 已收藏的单词在文章里会画黄线
- 成本控制：同一句话、同一个单词全站只调用一次 AI；每人每天有翻译额度

## 目录结构

```
wordtrail/
├── package.json        # 根目录：build / start 脚本（Railway 用）
├── railway.json
├── server/             # 后端 Node.js + Express + Postgres
│   └── src/
│       ├── index.js        入口，同时托管前端页面
│       ├── schema.sql      数据库结构（启动时自动建表）
│       ├── auth.js         注册登录
│       ├── routes.js       所有接口
│       ├── services.js     翻译缓存、查词、学习集、用量
│       ├── ai.js           DeepSeek 调用
│       ├── text.js         分段、分句
│       └── fetchArticle.js 网址抓取正文
└── client/             # 前端 React + Vite + Tailwind
    └── src/
        ├── pages/          书架、阅读、学习集等页面
        ├── components/     单词卡片、条目卡片等
        └── lib/            接口请求、朗读
```

## 本地运行

只需要 Node.js 20+，不用装数据库：

```bash
cd ~/Desktop/WordTrail
npm run local
```

打开 http://localhost:3000 。

- 没设置 `DATABASE_URL` 时，自动用内置的本地数据库，数据存在 `server/.localdb`。
- 没填 `DEEPSEEK_API_KEY` 时是「模拟模式」，译文显示【模拟译文】，不花钱。
- 想用真实翻译：把 `server/.env.example` 复制成 `server/.env`，填上 `DEEPSEEK_API_KEY`（`DATABASE_URL` 那行删掉或留空），重新运行。

改前端代码时想要热更新：另开终端 `cd client && npm run dev`，打开 http://localhost:5173 （需要后端用 `PORT=3001 npm start --prefix server` 启动）。

## 部署到 Railway

1. 把整个 `wordtrail` 文件夹推到一个新的 GitHub 仓库。
2. Railway 里 **New Project → Deploy from GitHub repo**，选这个仓库。
3. 在同一个项目里 **+ New → Database → PostgreSQL**。
4. 点开 WordTrail 服务 → **Variables**，添加：
   | 变量 | 值 |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}`（引用数据库变量） |
   | `JWT_SECRET` | 一串很长的随机字符（至少 16 位） |
   | `DEEPSEEK_API_KEY` | 你的 DeepSeek key |
   | `NODE_ENV` | `production` |
   | `DAILY_CHAR_LIMIT` | 可选，默认 20000 |
5. **Settings → Networking → Generate Domain**，拿到网址就能用了。

数据库表会在第一次启动时自动创建。

## 下一步（第二版）

- 复习卡片模式（翻卡、听写）
- 按遗忘曲线自动安排复习
- 长句语法拆解
