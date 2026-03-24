# 资讯日报（Digest）环境配置教程

本教程对应 **人工操作清单**：从空机器到能跑通 `POST /v1/digest/runs` 与定时 Cron 的最短路径。

## 0. 前置条件

- 已安装 **Node.js ≥ 18**（若解压/安装在自定义目录，例如 `E:\node`，请把 **`E:\node`** 和全局 npm 脚本目录 **`%AppData%\npm`** 加入系统 **PATH**，否则终端里可能找不到 `node` / `pnpm`）
- 已安装 **pnpm**（推荐：`E:\node\npm.cmd install -g pnpm@9.0.0`，与仓库 `packageManager` 一致）
- 拥有 **Cloudflare** 账号，并已安装 **Wrangler**（`npm i -g wrangler` 或仅使用项目 `devDependencies` 中的 `wrangler`：`pnpm exec wrangler`）
- 已登录 Cloudflare：`pnpm exec wrangler login`（在仓库根或 `packages/api` 下执行均可）

## 1. 安装依赖

在**仓库根目录** `ham_home-1.1.4`（内层 monorepo 根）执行：

```bash
pnpm install
```

## 2. 创建 Cloudflare 资源

在 **`packages/api`** 目录下执行（路径以你本机为准）。

### 2.1 D1 数据库

```bash
cd packages/api
pnpm exec wrangler d1 create hamhome-db
```

命令输出里会包含 **`database_id`**。打开 `packages/api/wrangler.toml`，**取消注释** `[[d1_databases]]` 段，把 `database_id` 填入。

### 2.2 队列（若尚未创建）

```bash
pnpm exec wrangler queues create hamhome-digest
```

名称须与 `wrangler.toml` 中 `queue = "hamhome-digest"` 一致。

### 2.3 密钥（按需）

在 **`packages/api`** 下执行（交互式输入，不会回显）：

```bash
pnpm exec wrangler secret put LLM_API_KEY
pnpm exec wrangler secret put RESEND_API_KEY
pnpm exec wrangler secret put RESEND_FROM
# 可选：MQTT HTTPS 桥
pnpm exec wrangler secret put MQTT_NOTIFY_URL
pnpm exec wrangler secret put MQTT_NOTIFY_SECRET
```

说明：

- **LLM**：不配则摘要退化为「标题列表」模式。
- **Resend**：不配则只写库 `digest_runs.summary_html`，不发邮件；发信需在 Resend 控制台验证发件域名，`RESEND_FROM` 形如 `HamHome <digest@你的域名>`。

## 3. 初始化 D1 表结构

需先有 **`users` 表**（外键依赖），再执行资讯日报扩展表。

在 **`packages/api`** 目录（这样 `wrangler.toml` 默认可用）：

```bash
# 1）基础 users 表
pnpm exec wrangler d1 execute hamhome-db --file=../../packages/db/migrations/d1/0000_users_minimal.sql

# 2）digest_* 表
pnpm exec wrangler d1 execute hamhome-db --file=../../packages/db/migrations/d1/0001_digest_tables.sql
```

> 若你使用 **本地** D1（`--local`），在命令末尾加 `--local` 用于本地调试。

## 4. 写入示例数据（种子）

将 `packages/db/migrations/d1/seed_example.sql` 中的邮箱、RSS 地址改成你自己的，然后：

```bash
pnpm exec wrangler d1 execute hamhome-db --file=../../packages/db/migrations/d1/seed_example.sql
```

默认测试用户 ID 为 **`dev-user-1`**（与种子文件一致）。

## 5. 本地启动 API

```bash
cd packages/api
pnpm dev
```

默认监听 **`http://127.0.0.1:8787`**（以终端输出为准）。

## 6. 验证接口

所有请求需带 **`X-User-Id: dev-user-1`**（与种子一致）。

### 6.1 健康检查

```bash
curl -s http://127.0.0.1:8787/health
```

### 6.2 查看设置

```bash
curl -s -H "X-User-Id: dev-user-1" http://127.0.0.1:8787/v1/digest/settings
```

### 6.3 触发一次日报（会入队并异步处理）

```bash
curl -s -X POST -H "X-User-Id: dev-user-1" http://127.0.0.1:8787/v1/digest/runs
```

### 6.4 查看运行结果

```bash
curl -s -H "X-User-Id: dev-user-1" http://127.0.0.1:8787/v1/digest/runs
```

若配置了 **LLM**，`summary_html` 为完整 HTML；若未配置，多为标题回退内容。

## 7. Web 控制台（可选）

在仓库根：

```bash
pnpm dev:web
```

浏览器打开 **`http://localhost:3000/digest`**，填写 API Base（如 `http://127.0.0.1:8787`）与 User ID（`dev-user-1`），可图形化触发与查看。

可在 `apps/web` 下设置环境变量 **`NEXT_PUBLIC_DIGEST_API_URL=http://127.0.0.1:8787`**。

## 8. 部署到生产

```bash
cd packages/api
pnpm exec wrangler deploy
```

部署后需在 Cloudflare 控制台确认 **D1 绑定、队列、Cron、Secrets** 均指向同一 Worker。

## 9. 常见问题

| 现象 | 处理 |
|------|------|
| `DB_NOT_CONFIGURED` | `wrangler.toml` 未配置或未生效 D1 `DB` 绑定 |
| 队列相关报错 | 先 `wrangler queues create hamhome-digest`；本地可暂时注释 `[[queues.*]]` 仅测 HTTP 写库 |
| 外键失败 | 先确保 `users` 中存在对应 `id` |
| Cron 不触发 | 仅部署后生效；本地 `wrangler dev` 对 Cron 支持有限，以文档为准 |

## 10. 与「完整 HamHome 书签库」的关系

本仓库 Drizzle 还包含书签、分类等表。若你只跑资讯日报，**仅需 `users` 最小表 + digest 表**；日后可再执行完整迁移合并数据。
