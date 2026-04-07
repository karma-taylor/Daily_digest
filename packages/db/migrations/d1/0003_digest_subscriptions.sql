-- 订阅配置：任意邮箱 + 时区 + 本地发送时间 + 主题
CREATE TABLE IF NOT EXISTS digest_subscriptions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  deliver_time_local TEXT NOT NULL,
  topics_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS digest_subscriptions_owner_enabled_idx
  ON digest_subscriptions(owner_user_id, enabled);

CREATE INDEX IF NOT EXISTS digest_subscriptions_enabled_idx
  ON digest_subscriptions(enabled);
