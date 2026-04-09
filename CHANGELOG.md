# 更新日志

本仓库为 HamHome / 资讯日报（Digest）相关代码。条目按时间倒序（最新在上）。

## 撰写约定（自 2026-04-09 起）

每条日期下固定分**两部分**（便于阅读与追溯）：

1. **现版本遇到的问题**：上线前用户或运维侧已暴露的问题、缺陷、痛点；若本次仅为日常技术迭代、无已知问题，则写 **暂无**。
2. **此次更新内容**：本版本实际交付的改动（功能、修复、文档、配置等）。

---

## 2026-04-09

### 现版本遇到的问题

- 定时订阅邮件连续多日未发送：`cron_tick` 中对订阅的去重逻辑误用「同一 owner 任意一条近期已完成的 `digest_runs`」与 cron 时间比对，导致在存在 `run_digest`、测试发送或其它订阅成功后，定时订阅被错误跳过。
- 管理页创建订阅时「定时发送」默认关闭，易产生 `enabled=false`、长期不参与调度的订阅。

### 此次更新内容

- 移除上述错误的 55 分钟去重判断，仅依赖本地时区与 `HH:mm` 的分钟窗口决定是否入队。
- 管理页新建订阅默认 `enabled: true`（仍可手动关闭）。
- 已部署 Worker 修复；详见提交 `fix(digest): unblock scheduled subscription emails`。

## 2026-04-07

### 现版本遇到的问题

- 缺少按邮箱的订阅管理与测试发送能力；调度粒度偏粗，难以按本地「时:分」定点投递。
- 单封邮件与单主题条目缺少可配置上限；`README` 仍指向上游 `ham_home`，与本仓库实际能力不一致。
- 远程 D1 迁移重复执行时易失败，阻断一键发布流程。

### 此次更新内容

- **数据与迁移**：新增 `digest_subscriptions` 及限额字段迁移 `0003` / `0004`（`max_items_per_email`、`max_items_per_topic`）。
- **API**：管理员订阅 CRUD + 测试发送；`DIGEST_ADMIN_TOKEN`、`DIGEST_ADMIN_OWNER_USER_ID`；分钟窗口调度工具 `schedule.ts`。
- **流水线**：按主题与整封邮件双重截断；`wrangler.toml` cron 调整为 `*/10 * * * *`。
- **前端**：订阅管理页双列布局、逗号分隔主题/关键词、发布脚本 `release.mjs` 与根目录 `api:release`；`0004` 已存在时发布不阻断 deploy + health。
- **文档**：根目录 `README` 改写为本项目说明。

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
