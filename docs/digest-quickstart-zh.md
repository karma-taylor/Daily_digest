# 尽快跑通资讯日报工作流（最短路径）

目标：**本机 `wrangler dev` 能执行一次完整「拉 RSS →（可选 LLM）→ 写入 `digest_runs`」**。

## 0. 终端（PowerShell）

- 若 `pnpm` 报脚本策略：用 **`pnpm.cmd`**，或执行  
  `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`
- 确保 **`E:\node`** 与 **`%AppData%\npm`** 在 PATH 中。

## 1. 装依赖（仓库根）

```powershell
cd E:\ai\1\ham_home-1.1.4\ham_home-1.1.4
pnpm.cmd install
```

## 2. 配置 D1（二选一）

### A. 仅本机（推荐先跑通）

1. 打开 `packages/api/wrangler.toml`，**取消注释** `[[d1_databases]]`，把 `database_id` 换成你在云端创建库后拿到的 ID；若暂未创建，先执行：

   ```powershell
   cd packages\api
   pnpm.cmd exec wrangler login
   pnpm.cmd exec wrangler d1 create hamhome-db
   ```

   把输出里的 **database_id** 粘到 `wrangler.toml`。

2. 初始化表 + 种子（**本地** SQLite，不消耗线上 D1）：

   ```powershell
   pnpm.cmd exec wrangler d1 execute hamhome-db --local --file=..\..\packages\db\migrations\d1\0000_users_minimal.sql
   pnpm.cmd exec wrangler d1 execute hamhome-db --local --file=..\..\packages\db\migrations\d1\0001_digest_tables.sql
   pnpm.cmd exec wrangler d1 execute hamhome-db --local --file=..\..\packages\db\migrations\d1\seed_example.sql
   ```

### B. 直接写云端 D1

把上面三条命令里的 `--local` 去掉，并确保 `database_id` 已正确。

## 3. 本地先不配 Queue（可选）

若尚未执行 `wrangler queues create hamhome-digest`，可**暂时注释** `packages/api/wrangler.toml` 里全部 `[[queues.producers]]` / `[[queues.consumers]]`。

当前逻辑：**`ENVIRONMENT=development` 且没有 Queue 时，`POST /v1/digest/runs` 会同步跑完整流水线**，无需消费者进程。

## 4. 启动 API

```powershell
cd packages\api
pnpm.cmd dev
```

终端里应出现 `http://127.0.0.1:8787`（以实际输出为准）。`wrangler.toml` 里 **`ENVIRONMENT` 须为 `development`**（默认已是）。

## 5. 验证

```powershell
curl.exe -s http://127.0.0.1:8787/health
curl.exe -s -X POST -H "X-User-Id: dev-user-1" http://127.0.0.1:8787/v1/digest/runs
curl.exe -s -H "X-User-Id: dev-user-1" http://127.0.0.1:8787/v1/digest/runs
```

第二次 `POST` 返回里若 **`syncDev: true`**，表示已同步跑完；第三次 `GET` 可看到 **`summary_html`**。

## 6. LLM / 邮件（可选）

- 摘要质量：在 Worker 上配置 Secret **`LLM_API_KEY`**（及按需改 `LLM_API_BASE` / `LLM_MODEL`）。
- 发信：配置 **`RESEND_API_KEY`**、**`RESEND_FROM`**。

不配 LLM 时仍会生成 **标题回退** 类摘要。

## 7. 再打开队列（与线上一致）

```powershell
pnpm.cmd exec wrangler queues create hamhome-digest
```

恢复 `wrangler.toml` 里 Queue 配置后，`POST /runs` 会**优先入队**；生产环境请保持 Queue + consumer。

---

更完整的说明见 **`digest-setup-tutorial-zh.md`**。

## 8. 首次部署 workers.dev 子域（非交互 / CI）

若 `wrangler deploy` 提示需注册 `workers.dev` 子域，在 **`packages/api`** 执行：

```powershell
pnpm.cmd run register-subdomain
pnpm.cmd exec wrangler deploy
```

脚本会调用 Cloudflare API，从本机 `default.toml` 读取 OAuth（勿把该文件提交到 Git）。

部署成功后，终端会打印形如 **`https://hamhome-api.<你的子域>.workers.dev`** 的地址。
