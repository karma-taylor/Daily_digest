-- Optional: append world/politics + tech RSS for dev-user-1 (does not change user settings)
-- wrangler d1 execute hamhome-db --remote --file=packages/db/migrations/d1/seed_extra_rss_world.sql

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
