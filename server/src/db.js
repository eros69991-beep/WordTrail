import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DATE 类型按原样返回 "2026-11-16"，不转成带时区的时间
pg.types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL;

let pool;

if (connectionString) {
  // 正式环境：Postgres（Railway）
  // Railway 内网连接不需要 SSL；公网连接（含 proxy.rlwy.net）需要
  const needsSsl = /rlwy\.net|sslmode=require/.test(connectionString);
  pool = new pg.Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
} else {
  // 本地开发：没配数据库时，用内置的 PGlite（数据存在 server/.localdb 文件夹）
  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = path.join(__dirname, '../.localdb');
  const db = new PGlite(dataDir, { parsers: { 1082: (v) => v } });
  await db.waitReady;
  console.log(`未设置 DATABASE_URL，使用本地内置数据库：${dataDir}`);

  const run = async (text, params) => {
    const r = await db.query(text, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  pool = {
    query: run,
    exec: (sql) => db.exec(sql),
    connect: async () => ({ query: run, release() {} }),
  };
}

export { pool };
export const query = (text, params) => pool.query(text, params);

export async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  if (pool.exec) await pool.exec(sql);
  else await pool.query(sql);
}
