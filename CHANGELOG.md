# 更新日志

本仓库为 HamHome / 资讯日报（Digest）相关代码。条目按时间倒序（最新在上）。

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