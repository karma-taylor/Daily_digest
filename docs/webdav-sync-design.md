# HamHome WebDAV 同步功能技术方案

## 1. 背景与目标

目前 HamHome 的数据存储在浏览器本地（书签元数据存储于 WXT local storage，内容数据存储于独立的 local storage item）。分类、AI 等配置使用 sync storage，但受限于 Chrome Sync 的容量限制（单项 8KB，总容量 100KB），这套机制无法满足海量书签对象跨设备同步的需求。

**目标**：引入基于标准 WebDAV 协议的支持，实现跨设备的无缝数据同步（书签、内容、分类和设置），不依赖中心化的专有后台，用户可以自由选择第三方网盘（如 Nutstore、Nextcloud 等）实现数据自主管理。

## 2. 总体架构设计

架构自下而上可分为存储层、业务同步层、调度层及 UI 层：

1. **存储接口与 WebDAV 客户端 (Storage Adapters & WebDAV Client)**
   - **本地存储**：沿用现有的 `bookmarkStorage`, `configStorage`, 不做破坏性改动。增加 `webdavStorage` 保存配置参数（地址、账号、密码及加密密钥）。
   - **WebDAV 客户端**：封装底层的 `fetch`，通过 WebDAV 标准方法（`PROPFIND`, `GET`, `PUT`, `MKCOL`）实现远程文件系统的读写，推荐使用 HTTP Basic Auth 鉴权。

2. **同步引擎 (Sync Engine)**
   - **差异比对系统**：处理本地与远端的数据版本对齐。
   - **合并策略控制**：解决冲突以确保最终一致性（Last-Write-Wins 原则）。

3. **后台调度器 (Background Scheduler)**
   - **自动化调度**：后台常驻服务 (`background.ts`) 中设置 periodic alarms（如每 30 分钟）或者侦听 storage change 使用防抖（Debounce）触发后台静默同步。

4. **UI 配置层 (Settings/Options)**
   - 在扩展的属性页提供独立的“WebDAV 同步”视图，供用户测试连接、手动同步和查看同步状态信息。

## 3. 数据结构与远端存储设计

在 WebDAV 目录下，建立清晰的层级，避免单文件过大。

```text
/HamHomeSync
  ├── sys.json            # 维护同步锁、当前最新 sync_version、最后同步时间
  ├── settings.json       # 系统 AI 与基础设置同步
  ├── categories.json     # 全量分类数据树同步
  ├── tags.json           # 标签信息库
  └── bookmarks/
      ├── meta.json       # 核心，所有书签的元数据数组（轻量级，核心索引）
      └── chunks/         # 内容目录：根据特定哈希或分片规则切割书签文章详情 (content)
          ├── chunk-a.json
          ├── chunk-b.json
          └── ...
```

**说明**：
- `sys.json`：维护同步锁状态（`lock_status`、`lock_timestamp`），防止多设备同时写入发生竞态冲突；记录当前最新 `sync_version` 和最后同步时间。
- `bookmarks/meta.json` 包含所有的元数据（id、URL、title、updatedAt、isDeleted）。数据发生任一变化时，全量覆盖同步该文件。
- `bookmarks/chunks/`：书签的主体抓取内容（如几百 KB 的网页文本）。该部分变更相对低频，只有新建、重抓取书签且 content 有变动时才增量上传对应分块，降低同步带宽和时间。

## 4. 冲突解决与合并策略 (Conflict Resolution)

我们采用 **双向同步、以时间戳为主 (Last-Write-Wins)** 的策略：

1. **准备阶段 (Pull & Compare)**
   - 从 WebDAV 获取 `meta.json`，在内存中反序列化得到远程记录集合。
   - 获取本地的 `local:bookmarks` 记录集合。
2. **记录级合并规则 (Record Level Merge)**
   - 按书签 `id` 进行交叉比对：
     - 若 `id` 仅存在于远端：则插入到本地。
     - 若 `id` 仅存在于本地：标记为**需上传**到远端。
     - 若 `id` 均存在：比对 `updatedAt` 时间戳。
       - 本地较新：使用本地数据覆盖远端，记录为**需上传**。
       - 远端较新：使用远端数据覆盖本地。
   - **软删除(Soft Delete)** 处理：保留 `isDeleted` 标识。任何一端标记为 `true`，只要其 `updatedAt` 最新，另一端也将同步此删除状态（而非物理删除），以防另一端由于短暂离线错过删除指令。
3. **提交与推送阶段 (Push)**
   - **并发与锁控制**：推送前检查并更新 `sys.json` 的锁定状态（若锁超时如 10 分钟则视为强退或死锁并强行夺锁），确保独占写入权限。
   - **严格的写入顺序**：如果合并过程中检测到本地有需要上传的变更，**必须先通过 WebDAV `PUT` 上传新增或更新的 `chunks` 分块文件**，确保内容优先落地。
   - 当检测到分块内容全部上传成功后，再将合并后的全量数据构建为新的 `meta.json`，执行 `PUT` 覆盖远端，这样即使中途断网中断，也不会导致元数据指向无效的不存在分块。
   - 记录最新时间戳至本地的同步状态中，并在完成时释放 `sys.json` 中的同步锁。

## 5. 核心实施路径

建议采取渐进式开发，主要分四个 Phase：

### Phase 1: 基础设施搭建
在 `apps/extension/lib/sync/` 目录下：
- **引入 `webdav` 标准库**：强烈极建议在扩展中安装成熟的 NPM 包 [`webdav`](https://www.npmjs.com/package/webdav)（`pnpm add webdav`）作为底层驱动。它完全兼容浏览器环境，能帮你自动处理复杂的 `PROPFIND` XML 响应解析，直接提供 `getFileContents()`, `putFileContents()`, `exists()`, `createDirectory()` 等开箱即用的高级 API。
- **自定义 Client 适配器 (`webdav-client.ts`)**：封装上述 `createClient()`。在此层可处理通用重试逻辑（Retry）、网络超时（Timeout）拦截，并统一将业务写入转化为 JSON 字符串提交。同时预留 Adapter 层拦截器，以兼容不同网盘服务（如坚果云、Nextcloud）在 WebDAV 规范上的微小实现差异和跨域 CORS 兼容。
- 在 `config-storage.ts` 或新建的 `sync-config-storage.ts` 里加入账户凭据模型 (URL, username, password, e2e_password)。建议将密码进行 AES 简单加密或存储到更安全的区域（防直接快照获取）。

### Phase 2: 同步引擎编码
在 `apps/extension/lib/sync/sync-engine.ts`：
- 构建 `doSync()` 核心状态机模块，串通：`fetchRemoteState -> mergeCategories -> mergeBookmarks -> determineDelta -> uploadChanges` 的流程。
- 考虑到数据规模，这部分需妥善捕捉错误，一旦某一步骤失败，抛出错误保留断点不损伤本地数据。

### Phase 3: 后台监控与调度机制
在 `services/background-service.ts` 及 `hooks` 中：
- `chrome.alarms.create('webdav-sync', { periodInMinutes: 30 })` 定期触发。
- 在 `bookmarkStorage` 的 `watchBookmarks` 订阅或操作书签接口中，加入发布订阅模式。每次变更防抖 5 分钟后触发静默的 background sync。
- 处理插件离线到在线的事件侦听，恢复网络后立即尝试一次 pull。

### Phase 4: 前端交互接入
在 `apps/extension/components/OptionsPage` （或设定页面）中：
- 增开 "云同步 (Cloud Sync)" 选项卡。
- 增加 WebDAV 服务器信息表单，支持连通性检查 (利用 HTTP `OPTIONS` / `PROPFIND` 测试)。
- **首次初始化同步 UX**：对于新设备首次绑定云端数据库，务必提供显式的全屏遮罩进度条（Initial Full Pull），防止处理海量历史数据合并时被意外打断，并在完成后放行。
- 展示上次同步时间、同步书签/分类条数、最后一次可能的错误提示。
- 提供“强制完全覆盖远端”和“强制拉取远端覆盖本地”的紧急修复按钮。

## 6. 其他性能与安全考量

1. **灾难恢复与防爆盾机制 (Disaster Recovery & Guardrails)**
   - **灾难阈值保护**：如果一次同步任务判断有超过 30% 或者 50% 的书签将被删除/覆盖，应当强制挂起静默同步并在 UI 端弹出危险警告，要求用户手动干预。这能有效阻断因本地库异常损坏导致的错误向云端瞬间蔓延。
   - **远端版本快照**：同步引擎应定期（如触发超过十次同步后）将上一版正常的 `meta.json` 自动在远端生成 `meta_backup.json` 的快照。其占用空间微乎其微，但对于极端故障能够兜底。
2. **废弃数据回收机制 (Garbage Collection)**
   被软删除的记录对应的网页内容块 `chunks` 若长期不理会会导致云盘迅速爆满。应加入 GC 机制：在软删除的 `updatedAt` 超过 30 天后，下一次触发同步的设备不仅会在元数据中彻底移除该记录，并且会发送 `DELETE` 请求主动清理远端其对应的废弃分块文件。
3. **安全校验与模式防御 (Schema Validation vs Untrusted Data)**
   **极力推荐使用项目中现有的 `Zod` 库**：所有从 WebDAV 读取的 JSON（尤其是 `meta.json` 和 `sys.json`）在反序列化进入内存之前，**必须**通过 Zod schema 验证格式。这是一种强有力的防毒墙，可以隔离掉由于网盘自身的冲突合并（比如坚果云自动生成的冲突副本导致内容错乱）或是用户误编所导致的脏数据直接击穿本地数据库的悲剧。
4. **端到端加密 (E2E Encryption) [可选增强]**
   为了保护个人隐私，如果用户存放在非私有部署公有云（如坚果云），可允许用户填入一串额外的 "主密钥 (Master Key)"。**技术建议**：不需要引入诸如 `crypto-js` 等厚重的第三方加解密库，直接调用浏览器原生的高性能 `window.crypto.subtle.encrypt` (AES-GCM 算法)。性能最好且零依赖。
5. **带宽优化与并发控制 (Concurrency & Compression)**
   - **分块并发限流**：当需同时上传/拉取 200 个 `chunks` 时，千万不要一股脑抛给 `Promise.all`，这将瞬间击穿大多数免费 WebDAV（如坚果云）的 QPS 限制并引发临时封禁（HTTP 429 或连接重置）。强烈建议引入并限制并发池（例如使用 `p-limit` 包，控制同时存在的 HTTP 请求数在 5~10）。
   - **压缩传输**：当单个 JSON 量级过大，文本传输与解析成为短板时。建议结合 `fflate` 库在内存中进行轻量的 `gzip`/`deflate` 压缩。保存文件以 `.gz` 结尾，体积通常能骤降 70%。
6. **CORS 与扩展权限限制**
   浏览器插件若主动 `fetch` 其他服务器，需在 `manifest.json` 的 `host_permissions` 中加入允许的范围，最快捷的方式是 `"*://*/*"`，但这会对 Chrome 的商店审核有更高要求。或者利用 `chrome.permissions.request()` 结合扩展 UI 让用户显式针对他们网盘所在的特定域名进行动态授权。这也能解决部分第三方网盘服务 CORS 不兼容的阻拦问题。
