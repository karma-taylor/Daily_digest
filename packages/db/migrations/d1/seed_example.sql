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
  0,
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

-- 国际/时政 + 科技 RSS（双主题共用；时政偏伊朗栏，科技偏 AI 栏）
INSERT OR REPLACE INTO digest_sources (id, user_id, kind, url, title, enabled, created_at, updated_at)
VALUES
  ('seed-rss-bbc-world', 'dev-user-1', 'rss', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC News World', 1, (strftime('%s', 'now') * 1000), (strftime('%s', 'now') * 1000)),
  ('seed-rss-guardian-world', 'dev-user-1', 'rss', 'https://www.theguardian.com/world/rss', 'The Guardian World', 1, (strftime('%s', 'now') * 1000), (strftime('%s', 'now') * 1000)),
  ('seed-rss-aljazeera', 'dev-user-1', 'rss', 'https://www.aljazeera.com/xml/rss/all.xml', 'Al Jazeera All', 1, (strftime('%s', 'now') * 1000), (strftime('%s', 'now') * 1000)),
  ('seed-rss-dw-top', 'dev-user-1', 'rss', 'https://rss.dw.com/xml/rss-en-all', 'DW English (all)', 1, (strftime('%s', 'now') * 1000), (strftime('%s', 'now') * 1000)),
  ('seed-rss-france24', 'dev-user-1', 'rss', 'https://www.france24.com/en/rss', 'France 24 English', 1, (strftime('%s', 'now') * 1000), (strftime('%s', 'now') * 1000)),
  ('seed-rss-npr-world', 'dev-user-1', 'rss', 'https://feeds.npr.org/1004/rss.xml', 'NPR World', 1, (strftime('%s', 'now') * 1000), (strftime('%s', 'now') * 1000)),
  ('seed-rss-un-news', 'dev-user-1', 'rss', 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', 'UN News All', 1, (strftime('%s', 'now') * 1000), (strftime('%s', 'now') * 1000)),
  ('seed-rss-techcrunch', 'dev-user-1', 'rss', 'https://techcrunch.com/feed/', 'TechCrunch', 1, (strftime('%s', 'now') * 1000), (strftime('%s', 'now') * 1000)),
  ('seed-rss-ars', 'dev-user-1', 'rss', 'https://feeds.arstechnica.com/arstechnica/index', 'Ars Technica', 1, (strftime('%s', 'now') * 1000), (strftime('%s', 'now') * 1000)),
  ('seed-rss-verge', 'dev-user-1', 'rss', 'https://www.theverge.com/rss/index.xml', 'The Verge', 1, (strftime('%s', 'now') * 1000), (strftime('%s', 'now') * 1000));

-- 双主题日报（需先对 D1 执行 0002_digest_topics_json.sql）
UPDATE digest_user_settings SET topics_json = '[{"label":"每日伊朗局势","maxItems":15,"keywords":["iran","iranian","tehran","middle east","israel","gaza","nuclear","sanction","伊朗","德黑兰","中东","核","制裁"]},{"label":"每日 AI 发展","maxItems":15,"keywords":["ai","llm","gpt","openai","claude","gemini","deepseek","machine learning","人工智能","大模型","深度学习"]}]' WHERE user_id = 'dev-user-1';
