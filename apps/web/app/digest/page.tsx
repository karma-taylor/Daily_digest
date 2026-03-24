'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * 资讯日报最小控制台：调用 Workers API（需与扩展/账号体系对接前先用 X-User-Id 调试）
 */
export default function DigestConsolePage() {
  const [base, setBase] = useState(
    process.env.NEXT_PUBLIC_DIGEST_API_URL ?? 'http://127.0.0.1:8787',
  );
  const [userId, setUserId] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  async function getSettings() {
    setLoading(true);
    try {
      const r = await fetch(`${base.replace(/\/$/, '')}/v1/digest/settings`, {
        headers: { 'X-User-Id': userId },
      });
      const j = await r.json();
      setBody(JSON.stringify(j, null, 2));
    } catch (e) {
      setBody(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setLoading(true);
    try {
      const r = await fetch(`${base.replace(/\/$/, '')}/v1/digest/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body: JSON.stringify({
          timezone: 'Asia/Shanghai',
          deliveryEmail: 'jiaweide0@gmail.com',
          keywords: ['科技', '宏观'],
          deliverHourLocal: 8,
          quietOnHolidays: true,
          mqttTopicSuffix: 'living-room',
        }),
      });
      const j = await r.json();
      setBody(JSON.stringify(j, null, 2));
    } catch (e) {
      setBody(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function triggerRun() {
    setLoading(true);
    try {
      const r = await fetch(`${base.replace(/\/$/, '')}/v1/digest/runs`, {
        method: 'POST',
        headers: { 'X-User-Id': userId },
      });
      const j = await r.json();
      setBody(JSON.stringify(j, null, 2));
    } catch (e) {
      setBody(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">资讯日报 · 控制台</h1>
          <Link href="/" className="text-sm text-indigo-400 hover:underline">
            返回首页
          </Link>
        </div>
        <p className="text-sm text-zinc-400">
          配置 Cloudflare Worker 地址与 <code className="text-indigo-300">X-User-Id</code>（须与 D1 中{' '}
          <code className="text-indigo-300">users.id</code> 一致）。生产环境请改为正式登录态。
        </p>
        <label className="block space-y-1 text-sm">
          <span className="text-zinc-400">API Base</span>
          <input
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-zinc-400">User ID</span>
          <input
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="D1 users 表主键"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || !userId}
            onClick={() => void getSettings()}
            className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
          >
            读取设置
          </button>
          <button
            type="button"
            disabled={loading || !userId}
            onClick={() => void saveSettings()}
            className="rounded bg-indigo-600 px-3 py-2 text-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            写入示例设置
          </button>
          <button
            type="button"
            disabled={loading || !userId}
            onClick={() => void triggerRun()}
            className="rounded bg-emerald-700 px-3 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            触发一次日报
          </button>
        </div>
        <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-300 min-h-[120px]">
          {body || (loading ? '…' : '响应将显示在此')}
        </pre>
      </div>
    </div>
  );
}
