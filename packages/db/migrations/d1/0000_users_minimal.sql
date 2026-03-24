-- 最小 users 表（与 packages/db/src/schema.ts 中 users 字段对齐），供 digest 外键使用。
-- 在 0001_digest_tables.sql 之前执行。

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  ai_provider TEXT,
  ai_api_key TEXT,
  ai_base_url TEXT,
  ai_model TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
