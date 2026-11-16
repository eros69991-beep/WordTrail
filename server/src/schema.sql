-- WordTrail 数据库结构（启动时自动执行，可重复执行）

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 文章
CREATE TABLE IF NOT EXISTS articles (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  source_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS articles_user_idx ON articles(user_id, created_at DESC);

-- 句子：block 是段落/标题/列表项/代码块，一个 block 里有多句
CREATE TABLE IF NOT EXISTS sentences (
  id           SERIAL PRIMARY KEY,
  article_id   INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  block_index  INTEGER NOT NULL,
  block_type   TEXT NOT NULL,            -- p | h | li | code
  position     INTEGER NOT NULL,         -- 全文顺序
  text         TEXT NOT NULL,
  translation  TEXT
);
CREATE INDEX IF NOT EXISTS sentences_article_idx ON sentences(article_id, position);

-- 全站共享的翻译缓存：同一句话只翻译一次
CREATE TABLE IF NOT EXISTS translation_cache (
  hash        TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  translation TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 全站共享的单词缓存：音标、释义、例句
CREATE TABLE IF NOT EXISTS word_cache (
  word        TEXT PRIMARY KEY,
  phonetic    TEXT,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 学习条目（单词或句子）
CREATE TABLE IF NOT EXISTS items (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL,      -- word | sentence
  text               TEXT NOT NULL,
  phonetic           TEXT,
  meaning            TEXT,               -- 单词：在原句中的意思；句子：中文翻译
  details            JSONB,              -- 单词：常见释义、例句；句子：备用
  source_sentence    TEXT,
  source_translation TEXT,
  article_id         INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'new',   -- new | review | mastered
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_user_idx ON items(user_id, created_at DESC);

-- 学习集（每天自动一个，可改名）
CREATE TABLE IF NOT EXISTS collections (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  day         DATE,                      -- 自动生成的每日学习集才有日期
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS collections_user_day_idx ON collections(user_id, day) WHERE day IS NOT NULL;

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, item_id)
);

-- 每人每天的 AI 用量（按字符数），用来控制成本
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  chars    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
