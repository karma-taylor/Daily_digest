# 更新日志

本仓库为 HamHome / 资讯日报（Digest）相关代码。条目按时间倒序（最新在上）。

## 2026-04-09

### Fixed

- **Scheduled subscription emails skipped**: removed incorrect dedupe in `cron_tick` that compared any recent `digest_runs` `done` row for the owner user against the cron `scheduledTime`, which blocked sends after `run_digest`, tests, or another subscription run.
- **Default subscription enabled**: digest admin UI now defaults `enabled` to `true` so new subscriptions are eligible for cron unless explicitly turned off.
## 2026-04-07

### Added

- **Subscription schema and migrations**: added `digest_subscriptions` with migration files `0003_digest_subscriptions.sql` and `0004_digest_subscription_limits.sql`, including `max_items_per_email` and `max_items_per_topic`.
- **Admin subscription API**: added list/create/update/delete/test endpoints with bearer auth via `DIGEST_ADMIN_TOKEN` and owner binding via `DIGEST_ADMIN_OWNER_USER_ID`.
- **Minute-window scheduler utility**: added `schedule.ts` for timezone-based `HH:mm` trigger checks.
- **One-click release script**: added `packages/api/scripts/release.mjs` to run D1 migrations, Worker deploy, and `/health` checks.

### Changed

- **Cron frequency**: changed `wrangler.toml` cron to `*/10 * * * *` to support minute-level delivery timing.
- **Pipeline limits**: enforced per-topic and per-email item caps during digest generation.
- **Digest admin UI**: redesigned to a two-column layout; topics/keywords now use single CSV inputs; added compact `hourly` switch and delivery-time label switch to `start time` when hourly mode is enabled; bottom actions changed to `Test` and `Create`.
- **Admin header behavior**: admin operations no longer rely on `X-User-Id` from frontend requests.
- **Release resilience**: release flow now continues deploy and health-check when migration `0004` is already applied.

## 2026-04-04

### 新增

- **双主题日报**：支持按 `topics` 关键词将条目分桶（示例：每日伊朗局势、每日 AI 发展，各约 15 条）；D1 迁移 `0002_digest_topics_json.sql`，`PUT/GET /v1/digest/settings` 支持 `topics`。
- **`seed_extra_rss_world.sql`**：可选种子，为 `dev-user-1` 追加国际/时政与科技类 RSS（BBC World、Guardian、Al Jazeera、DW、France 24、NPR、UN News、TechCrunch、Ars、Verge），不覆盖用户 settings。
- **`seed_example.sql`**：在 Hacker News 示例外，默认写入上述多源 RSS，便于新环境一次种子即有足够素材。

### 变更

- **邮件 HTML 主标题**：双主题模式下与主题前缀一致（`renderDigestEmailHtml` 支持 `meta.title`，流水线传入 `emailSubjectPrefix`）。
- **DW 英文 RSS**：原 `https://rss.dw.com/rss/en/top_stories` 已 404，改为 `https://rss.dw.com/xml/rss-en-all`（种子与线上库需同步执行更新或重新 `INSERT OR REPLACE` 对应源）。
- **文档**：`docs/digest-quickstart-zh.md` §6b 补充多源 RSS 与 `wrangler d1 execute … seed_extra_rss_world.sql` 说明。

### 类型与 API

- `@hamhome/types`：`DigestTopicConfigDTO`，settings DTO 增加可选 `topics`。

---

## 更早

- 仓库自 `ham_home` 单体拆出后的扁平化 monorepo、许可证与元数据等，见 Git 历史。