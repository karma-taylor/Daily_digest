-- 示例种子：测试用户 + 日报设置 + 一条 RSS 源
-- 执行前请按需修改 email、RSS URL。
-- 用户 ID 固定为 dev-user-1，与教程中的 X-User-Id 一致。

INSERT OR REPLACE INTO users (id, email, name, created_at, updated_at)
VALUES (
  'dev-user-1',
  'jiaweide0@gmail.com',
  '本地开发用户',
  (strftime('%s', 'now') * 1000),
  (strftime('%s', 'now') * 1000)
);

INSERT OR REPLACE INTO digest_user_settings (
  user_id,
  timezone,
  delivery_email,
  keywords_json,
  deliver_hour_local,
  quiet_on_holidays,
  mqtt_topic_suffix,
  updated_at
)
VALUES (
  'dev-user-1',
  'Asia/Shanghai',
  'jiaweide0@gmail.com',
  '[]',
  8,
  1,
  'demo-device',
  (strftime('%s', 'now') * 1000)
);

-- 一条公开 RSS（可换成任意可访问的 feed）
INSERT OR REPLACE INTO digest_sources (id, user_id, kind, url, title, enabled, created_at, updated_at)
VALUES (
  'seed-rss-1',
  'dev-user-1',
  'rss',
  'https://news.ycombinator.com/rss',
  'Hacker News (示例)',
  1,
  (strftime('%s', 'now') * 1000),
  (strftime('%s', 'now') * 1000)
);
