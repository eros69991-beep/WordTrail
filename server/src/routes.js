import { Router } from 'express';
import { query, pool } from './db.js';
import { requireAuth } from './auth.js';
import { fetchArticle, UserError } from './fetchArticle.js';
import { textToBlocks, blocksToSentences, needsTranslation } from './text.js';
import {
  translateTexts, lookupWord, createItem, getUsage, validDay, QuotaError,
} from './services.js';

export const api = Router();
api.use(requireAuth);

const checkId = (req, res, next, v) => (/^\d{1,9}$/.test(v) ? next() : res.status(404).json({ error: '不存在' }));
api.param('id', checkId);
api.param('itemId', checkId);

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (e instanceof UserError || e instanceof QuotaError) return res.status(400).json({ error: e.message });
  console.error(e);
  res.status(500).json({ error: '服务器出错了，请稍后再试' });
});

const STATUSES = ['new', 'review', 'mastered'];
const localDay = (req) => validDay(req.get('X-Local-Date'));

// ================= 文章 =================

api.get('/articles', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.title, a.source_url, a.created_at,
            count(s.id)::int AS total,
            count(s.id) FILTER (WHERE s.translation IS NOT NULL OR s.block_type = 'code')::int AS translated
     FROM articles a LEFT JOIN sentences s ON s.article_id = a.id
     WHERE a.user_id = $1 GROUP BY a.id ORDER BY a.created_at DESC`,
    [req.userId],
  );
  res.json({ articles: rows });
}));

api.post('/articles', wrap(async (req, res) => {
  let title, blocks, url = null;
  if (req.body.url) {
    ({ title, blocks, url } = await fetchArticle(String(req.body.url).trim()));
  } else {
    const text = String(req.body.text || '');
    if (!text.trim()) throw new UserError('内容是空的');
    blocks = textToBlocks(text);
    title = String(req.body.title || '').trim();
    if (!title) {
      // 第一块是标题的话，直接拿来当文章标题，并从正文里去掉，避免重复显示
      if (blocks[0]?.type === 'h') title = blocks.shift().text;
      else title = (blocks.find((b) => b.type !== 'code')?.text || '未命名文章').slice(0, 60);
    }
  }
  const rows = blocksToSentences(blocks);
  if (!rows.length) throw new UserError('没有找到可以阅读的内容');
  if (!rows.some((r) => /[A-Za-z]{2,}/.test(r.text))) throw new UserError('这好像不是英文文章');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [article] } = await client.query(
      'INSERT INTO articles (user_id, title, source_url) VALUES ($1, $2, $3) RETURNING id',
      [req.userId, title.slice(0, 300), url],
    );
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      const params = [];
      const values = part.map((r, j) => {
        params.push(article.id, r.blockIndex, r.blockType, i + j, r.text);
        const n = params.length;
        return `($${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}, $${n})`;
      });
      await client.query(
        `INSERT INTO sentences (article_id, block_index, block_type, position, text) VALUES ${values.join(',')}`,
        params,
      );
    }
    await client.query('COMMIT');
    res.json({ id: article.id });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

async function ownArticle(userId, id) {
  const { rows } = await query('SELECT id, title, source_url, created_at FROM articles WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0];
}

api.get('/articles/:id', wrap(async (req, res) => {
  const article = await ownArticle(req.userId, req.params.id);
  if (!article) return res.status(404).json({ error: '文章不存在' });
  const { rows } = await query(
    'SELECT id, block_index, block_type, text, translation FROM sentences WHERE article_id = $1 ORDER BY position',
    [article.id],
  );
  // 这篇文章里已经收藏过的单词（阅读时可高亮）
  const saved = await query("SELECT lower(text) AS t FROM items WHERE user_id = $1 AND kind = 'word'", [req.userId]);
  res.json({ article, sentences: rows, savedWords: saved.rows.map((r) => r.t) });
}));

api.patch('/articles/:id', wrap(async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 300);
  if (!title) throw new UserError('标题不能为空');
  const r = await query('UPDATE articles SET title = $1 WHERE id = $2 AND user_id = $3', [title, req.params.id, req.userId]);
  if (!r.rowCount) return res.status(404).json({ error: '文章不存在' });
  res.json({ ok: true });
}));

api.delete('/articles/:id', wrap(async (req, res) => {
  await query('DELETE FROM articles WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// 每次翻译一批未翻译的句子，前端循环调用直到 done
const translating = new Set();
api.post('/articles/:id/translate', wrap(async (req, res) => {
  const article = await ownArticle(req.userId, req.params.id);
  if (!article) return res.status(404).json({ error: '文章不存在' });
  if (translating.has(article.id)) return res.json({ updated: [], done: false, busy: true });
  translating.add(article.id);
  try {
    const { rows } = await query(
      `SELECT id, text FROM sentences WHERE article_id = $1 AND translation IS NULL AND block_type <> 'code'
       ORDER BY position LIMIT 40`,
      [article.id],
    );
    const toAI = rows.filter((r) => needsTranslation(r.text));
    const map = await translateTexts(req.userId, toAI.map((r) => r.text));
    const updated = rows.map((r) => ({ id: r.id, translation: needsTranslation(r.text) ? map.get(r.text) : '' }));
    if (updated.length) {
      await query(
        `UPDATE sentences s SET translation = v.t FROM
           (SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS t) v
         WHERE s.id = v.id`,
        [updated.map((u) => u.id), updated.map((u) => u.translation)],
      );
    }
    const left = await query(
      "SELECT count(*)::int AS n FROM sentences WHERE article_id = $1 AND translation IS NULL AND block_type <> 'code'",
      [article.id],
    );
    res.json({ updated, done: left.rows[0].n === 0, remaining: left.rows[0].n });
  } finally {
    translating.delete(article.id);
  }
}));

// ================= 查词 =================

api.get('/lookup', wrap(async (req, res) => {
  const info = await lookupWord(req.userId, req.query.word);
  if (!info) throw new UserError('只能查英文单词');
  const saved = await query("SELECT id, status FROM items WHERE user_id = $1 AND kind = 'word' AND lower(text) = $2", [req.userId, info.word]);
  res.json({ ...info, saved: saved.rows[0] || null });
}));

api.get('/usage', wrap(async (req, res) => res.json(await getUsage(req.userId))));

// ================= 学习条目 =================

api.post('/items', wrap(async (req, res) => {
  const out = await createItem(req.userId, {
    kind: req.body.kind,
    text: req.body.text,
    sentenceId: req.body.sentenceId,
    day: localDay(req),
  }).catch((e) => {
    if (e instanceof QuotaError) throw e;
    if (/内容为空|太长|只能收藏/.test(e.message)) throw new UserError(e.message);
    throw e;
  });
  res.json(out);
}));

// 按状态筛选全部条目（比如「全部待复习」）
api.get('/items', wrap(async (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  const { rows } = await query(
    `SELECT * FROM items WHERE user_id = $1 AND ($2::text IS NULL OR status = $2) ORDER BY created_at DESC LIMIT 500`,
    [req.userId, status],
  );
  res.json({ items: rows });
}));

api.patch('/items/:id', wrap(async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) throw new UserError('状态不对');
  const { rows } = await query('UPDATE items SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *', [status, req.params.id, req.userId]);
  if (!rows[0]) return res.status(404).json({ error: '条目不存在' });
  res.json({ item: rows[0] });
}));

api.delete('/items/:id', wrap(async (req, res) => {
  await query('DELETE FROM items WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

// ================= 学习集 =================

api.get('/collections', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.name, c.day, c.created_at,
            count(i.id)::int AS total,
            count(i.id) FILTER (WHERE i.kind = 'word')::int AS words,
            count(i.id) FILTER (WHERE i.kind = 'sentence')::int AS sentences,
            count(i.id) FILTER (WHERE i.status = 'review')::int AS review,
            count(i.id) FILTER (WHERE i.status = 'mastered')::int AS mastered
     FROM collections c
     LEFT JOIN collection_items ci ON ci.collection_id = c.id
     LEFT JOIN items i ON i.id = ci.item_id
     WHERE c.user_id = $1
     GROUP BY c.id ORDER BY COALESCE(c.day, c.created_at::date) DESC, c.id DESC`,
    [req.userId],
  );
  const counts = await query(
    'SELECT status, count(*)::int AS n FROM items WHERE user_id = $1 GROUP BY status',
    [req.userId],
  );
  res.json({ collections: rows, statusCounts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])) });
}));

api.post('/collections', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  if (!name) throw new UserError('名字不能为空');
  const { rows } = await query('INSERT INTO collections (user_id, name) VALUES ($1, $2) RETURNING *', [req.userId, name]);
  res.json({ collection: rows[0] });
}));

api.get('/collections/:id', wrap(async (req, res) => {
  const c = await query('SELECT * FROM collections WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!c.rows[0]) return res.status(404).json({ error: '学习集不存在' });
  const { rows } = await query(
    `SELECT i.*, a.title AS article_title FROM collection_items ci
     JOIN items i ON i.id = ci.item_id
     LEFT JOIN articles a ON a.id = i.article_id
     WHERE ci.collection_id = $1 ORDER BY ci.added_at DESC`,
    [req.params.id],
  );
  res.json({ collection: c.rows[0], items: rows });
}));

api.patch('/collections/:id', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  if (!name) throw new UserError('名字不能为空');
  const { rows } = await query('UPDATE collections SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *', [name, req.params.id, req.userId]);
  if (!rows[0]) return res.status(404).json({ error: '学习集不存在' });
  res.json({ collection: rows[0] });
}));

// 删除学习集：只在这个集里的条目一起删掉，同时在别的集里的保留
api.delete('/collections/:id', wrap(async (req, res) => {
  const c = await query('SELECT id FROM collections WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!c.rows[0]) return res.json({ ok: true });
  await query(
    `DELETE FROM items WHERE user_id = $1 AND id IN (
       SELECT item_id FROM collection_items WHERE collection_id = $2
       EXCEPT SELECT item_id FROM collection_items WHERE collection_id <> $2)`,
    [req.userId, req.params.id],
  );
  await query('DELETE FROM collections WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// 把条目加到另一个学习集（比如手动建的「待复习」）
api.post('/collections/:id/items', wrap(async (req, res) => {
  const ok = await query(
    `SELECT (SELECT 1 FROM collections WHERE id = $1 AND user_id = $3) AS c,
            (SELECT 1 FROM items WHERE id = $2 AND user_id = $3) AS i`,
    [req.params.id, req.body.itemId, req.userId],
  );
  if (!ok.rows[0].c || !ok.rows[0].i) return res.status(404).json({ error: '不存在' });
  await query('INSERT INTO collection_items (collection_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, req.body.itemId]);
  res.json({ ok: true });
}));

api.delete('/collections/:id/items/:itemId', wrap(async (req, res) => {
  await query(
    `DELETE FROM collection_items WHERE collection_id = $1 AND item_id = $2
     AND EXISTS (SELECT 1 FROM collections WHERE id = $1 AND user_id = $3)`,
    [req.params.id, req.params.itemId, req.userId],
  );
  res.json({ ok: true });
}));
