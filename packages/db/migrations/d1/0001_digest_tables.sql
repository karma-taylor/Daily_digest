-- 资讯日报扩展表（在 D1 上执行：wrangler d1 execute hamhome-db --file=...）
-- 若已有 users 表且由其他迁移创建，请按需调整顺序。

CREATE TABLE IF NOT EXISTS digest_sources (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS digest_sources_user_id_idx ON digest_sources(user_id);

CREATE TABLE IF NOT EXISTS digest_user_settings (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  delivery_email TEXT,
  keywords_json TEXT,
  deliver_hour_local INTEGER DEFAULT 8,
  quiet_on_holidays INTEGER DEFAULT 0,
  mqtt_topic_suffix TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS digest_runs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  summary_html TEXT,
  error TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS digest_runs_user_id_idx ON digest_runs(user_id);
CREATE INDEX IF NOT EXISTS digest_runs_status_idx ON digest_runs(status);
