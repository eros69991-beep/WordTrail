import crypto from 'node:crypto';
import { query, pool } from './db.js';
import { translateBatch, lookupWordAI, contextMeaningAI, dictionaryPhonetic } from './ai.js';

export const DAILY_CHAR_LIMIT = Number(process.env.DAILY_CHAR_LIMIT || 20000);
const WORD_LOOKUP_COST = 150; // 查一次新词按 150 字符计入用量

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const utcDay = () => new Date().toISOString().slice(0, 10);

export class QuotaError extends Error {}

// ---------- 用量 ----------
export async function getUsage(userId) {
  const { rows } = await query('SELECT chars FROM usage_daily WHERE user_id = $1 AND day = $2', [userId, utcDay()]);
  return { used: rows[0]?.chars || 0, limit: DAILY_CHAR_LIMIT };
}

async function chargeUsage(userId, chars) {
  // 原子地检查并扣减：超过上限就不扣、返回 false
  if (chars > DAILY_CHAR_LIMIT) return false;
  const { rows } = await query(
    `INSERT INTO usage_daily (user_id, day, chars) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, day) DO UPDATE SET chars = usage_daily.chars + EXCLUDED.chars
       WHERE usage_daily.chars + EXCLUDED.chars <= $4
     RETURNING chars`,
    [userId, utcDay(), chars, DAILY_CHAR_LIMIT],
  );
  if (!rows.length) return false;
  return rows[0].chars <= DAILY_CHAR_LIMIT;
}

async function refundUsage(userId, chars) {
  await query('UPDATE usage_daily SET chars = GREATEST(0, chars - $3) WHERE user_id = $1 AND day = $2', [userId, utcDay(), chars]);
}

// ---------- 翻译（带全站缓存） ----------

// 条数对不上时对半拆开重试，最小到单句
async function translateRobust(sentences) {
  try {
    return await translateBatch(sentences);
  } catch (e) {
    if (sentences.length === 1 || !/条数不对/.test(e.message)) throw e;
    const mid = Math.ceil(sentences.length / 2);
    return [...(await translateRobust(sentences.slice(0, mid))), ...(await translateRobust(sentences.slice(mid)))];
  }
}

/** 翻译一组句子文本，返回 Map(text → translation)。先查缓存，缺的才调 AI 并扣用量 */
export async function translateTexts(userId, texts) {
  const unique = [...new Set(texts)];
  const result = new Map();
  if (!unique.length) return result;

  const hashes = unique.map(hash);
  const { rows } = await query('SELECT hash, translation FROM translation_cache WHERE hash = ANY($1)', [hashes]);
  const cached = new Map(rows.map((r) => [r.hash, r.translation]));
  const missing = [];
  unique.forEach((t, i) => {
    if (cached.has(hashes[i])) result.set(t, cached.get(hashes[i]));
    else missing.push(t);
  });
  if (!missing.length) return result;

  const cost = missing.reduce((n, t) => n + t.length, 0);
  if (!(await chargeUsage(userId, cost))) {
    throw new QuotaError(`今天的翻译额度（${DAILY_CHAR_LIMIT} 字符）用完了，明天再继续`);
  }

  try {
    const CHUNK = 25;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const part = missing.slice(i, i + CHUNK);
      const out = await translateRobust(part);
      const values = [];
      const params = [];
      part.forEach((t, j) => {
        result.set(t, out[j]);
        params.push(hash(t), t, out[j]);
        values.push(`($${params.length - 2}, $${params.length - 1}, $${params.length})`);
      });
      await query(
        `INSERT INTO translation_cache (hash, text, translation) VALUES ${values.join(',')} ON CONFLICT (hash) DO NOTHING`,
        params,
      );
    }
  } catch (e) {
    await refundUsage(userId, cost);
    throw e;
  }
  return result;
}

// ---------- 查词（带全站缓存） ----------
export function normalizeWord(w) {
  return String(w || '')
    .trim()
    .replace(/[’]/g, "'")
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

export async function lookupWord(userId, rawWord) {
  const word = normalizeWord(rawWord);
  if (!word || !/^[a-z][a-z' -]*$/.test(word)) return null;

  const { rows } = await query('SELECT phonetic, data FROM word_cache WHERE word = $1', [word]);
  if (rows[0]) return { word, phonetic: rows[0].phonetic, ...rows[0].data };

  if (!(await chargeUsage(userId, WORD_LOOKUP_COST))) {
    throw new QuotaError('今天的查词额度用完了，明天再继续');
  }
  let ai;
  try {
    const [dictPh, aiData] = await Promise.all([dictionaryPhonetic(word), lookupWordAI(word)]);
    ai = aiData;
    ai.phonetic = dictPh || ai.phonetic || '';
  } catch (e) {
    await refundUsage(userId, WORD_LOOKUP_COST);
    throw e;
  }
  const data = {
    lemma: ai.lemma || word,
    meanings: Array.isArray(ai.meanings) ? ai.meanings.slice(0, 4) : [],
    examples: Array.isArray(ai.examples) ? ai.examples.slice(0, 3) : [],
  };
  await query(
    'INSERT INTO word_cache (word, phonetic, data) VALUES ($1, $2, $3) ON CONFLICT (word) DO NOTHING',
    [word, ai.phonetic, data],
  );
  return { word, phonetic: ai.phonetic, ...data };
}

// ---------- 每日学习集 ----------
export function validDay(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d)) ? d : utcDay();
}

export async function getOrCreateDailyCollection(userId, day) {
  const { rows } = await query(
    `INSERT INTO collections (user_id, name, day) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, day) WHERE day IS NOT NULL DO UPDATE SET day = EXCLUDED.day
     RETURNING id, name, day`,
    [userId, `${day} 学习`, day],
  );
  return rows[0];
}

// ---------- 新建学习条目 ----------
export async function createItem(userId, { kind, text, sentenceId, day }) {
  kind = kind === 'sentence' ? 'sentence' : 'word';
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (kind === 'word') text = normalizeWord(text);
  if (!text) throw new Error('内容为空');
  if (text.length > 1000) throw new Error('选中的内容太长了');

  // 来源句子（必须是自己的文章）
  let source = null;
  if (sentenceId) {
    const { rows } = await query(
      `SELECT s.text, s.translation, s.article_id FROM sentences s
       JOIN articles a ON a.id = s.article_id
       WHERE s.id = $1 AND a.user_id = $2`,
      [sentenceId, userId],
    );
    source = rows[0] || null;
  }

  const collection = await getOrCreateDailyCollection(userId, day);

  // 已经收藏过：不重复建，只是加进今天的学习集
  const existing = await query('SELECT * FROM items WHERE user_id = $1 AND kind = $2 AND lower(text) = lower($3) LIMIT 1', [userId, kind, text]);
  let item = existing.rows[0];
  let existed = Boolean(item);

  if (!item) {
    let phonetic = null;
    let meaning = null;
    let details = null;
    if (kind === 'word') {
      const info = await lookupWord(userId, text);
      if (!info) throw new Error('只能收藏英文单词');
      phonetic = info.phonetic;
      details = { lemma: info.lemma, meanings: info.meanings, examples: info.examples };
      if (source?.text) {
        meaning = await contextMeaningAI(text, source.text).catch(() => null);
      }
      if (!meaning) meaning = info.meanings.map((m) => `${m.pos} ${m.zh}`).join('；');
    } else {
      // 选中的正好是整句，直接用已有译文；否则翻译选中片段
      if (source && source.text.trim() === text && source.translation) {
        meaning = source.translation;
      } else {
        const map = await translateTexts(userId, [text]);
        meaning = map.get(text);
      }
    }
    const { rows } = await query(
      `INSERT INTO items (user_id, kind, text, phonetic, meaning, details, source_sentence, source_translation, article_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [userId, kind, text, phonetic, meaning, details, source?.text || null, source?.translation || null, source?.article_id || null],
    );
    item = rows[0];
  }

  await query('INSERT INTO collection_items (collection_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [collection.id, item.id]);
  return { item, existed, collection };
}

export { pool };
