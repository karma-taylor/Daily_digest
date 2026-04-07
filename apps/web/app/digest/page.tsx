'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';

type Topic = { label: string; keywords: string[]; maxItems?: number };
type Subscription = {
  id: string;
  email: string;
  timezone: string;
  deliverTimeLocal: string;
  topics: Topic[];
  enabled: boolean;
};

const MAX_TOPICS = 3;
const MAX_KEYWORDS = 5;

function splitCsv(input: string, limit: number): string[] {
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export default function DigestConsolePage() {
  const [base, setBase] = useState(process.env.NEXT_PUBLIC_DIGEST_API_URL ?? 'http://127.0.0.1:8787');
  const [adminToken, setAdminToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState('');
  const [rows, setRows] = useState<Subscription[]>([]);

  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [deliverTimeLocal, setDeliverTimeLocal] = useState('09:00');
  const [enabled, setEnabled] = useState(false);
  const [hourlyEnabled, setHourlyEnabled] = useState(false);
  const [topicInput, setTopicInput] = useState('每日 AI 发展, 行业快讯');
  const [keywordInput, setKeywordInput] = useState('ai, llm, openai');

  useEffect(() => {
    const saved = window.localStorage.getItem('digest_admin_token') ?? '';
    if (saved) setAdminToken(saved);
  }, []);

  const topicDraft = useMemo(() => {
    const labels = splitCsv(topicInput, MAX_TOPICS);
    const keywords = splitCsv(keywordInput, MAX_KEYWORDS);
    if (labels.length === 0 || keywords.length === 0) return [];
    return labels.map((label) => ({ label, keywords, maxItems: 15 }));
  }, [topicInput, keywordInput]);

  async function call(path: string, init?: RequestInit) {
    const r = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        ...(init?.headers || {}),
      },
    });
    const j = await r.json();
    setResp(JSON.stringify(j, null, 2));
    return j;
  }

  async function loadSubscriptions() {
    setLoading(true);
    try {
      const j = await call('/v1/digest/subscriptions');
      setRows(Array.isArray(j?.data) ? j.data : []);
    } finally {
      setLoading(false);
    }
  }

  async function createSubscription(mode: 'create' | 'test') {
    setLoading(true);
    try {
      const created = await call('/v1/digest/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ email, timezone, deliverTimeLocal, topics: topicDraft, enabled }),
      });
      const createdId = created?.data?.id as string | undefined;
      if (mode === 'test' && createdId) {
        await call(`/v1/digest/subscriptions/${createdId}/test`, { method: 'POST' });
      }
      await loadSubscriptions();
    } finally {
      setLoading(false);
    }
  }

  async function toggleEnabled(id: string, next: boolean) {
    setLoading(true);
    try {
      await call(`/v1/digest/subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: next }),
      });
      await loadSubscriptions();
    } finally {
      setLoading(false);
    }
  }

  async function testSend(id: string) {
    setLoading(true);
    try {
      await call(`/v1/digest/subscriptions/${id}/test`, { method: 'POST' });
    } finally {
      setLoading(false);
    }
  }

  async function removeSub(id: string) {
    setLoading(true);
    try {
      await call(`/v1/digest/subscriptions/${id}`, { method: 'DELETE' });
      await loadSubscriptions();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">资讯日报 · 订阅管理</h1>
          <div className="flex items-center gap-3">
            <button
              className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
              disabled={loading || !adminToken}
              onClick={() => void loadSubscriptions()}
            >
              刷新列表
            </button>
            <Link href="/" className="text-sm text-indigo-400 hover:underline">
              返回首页
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="API Base"
          />
          <input
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={adminToken}
            onChange={(e) => {
              const v = e.target.value;
              setAdminToken(v);
              window.localStorage.setItem('digest_admin_token', v);
            }}
            placeholder="Admin Token (Bearer)"
          />
        </div>

        <div className="rounded border border-zinc-800 bg-zinc-900 p-4 space-y-4">
          <h2 className="font-medium">创建订阅</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm text-zinc-300">邮箱地址</label>
                <input
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-zinc-300">{hourlyEnabled ? '发送起始时间' : '发送时间'}</label>
                <input
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={deliverTimeLocal}
                  onChange={(e) => setDeliverTimeLocal(e.target.value)}
                  placeholder="HH:mm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-zinc-300">主题</label>
                <div className="text-xs text-zinc-500">最多三个主题，逗号分隔</div>
                <input
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  placeholder="AI资讯, 大模型进展, 行业快讯"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm text-zinc-300">时区</label>
                <input
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Asia/Shanghai"
                />
              </div>

              <div className="flex items-center gap-5 rounded border border-zinc-800 bg-zinc-950 px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    className="h-4 w-4"
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  定时发送
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    className="h-4 w-4"
                    type="checkbox"
                    checked={hourlyEnabled}
                    onChange={(e) => setHourlyEnabled(e.target.checked)}
                  />
                  每小时发送
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-zinc-300">关键词</label>
                <div className="text-xs text-zinc-500">最多五个关键词，逗号分隔</div>
                <input
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="ai, llm, openai, anthropic, 智能体"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              className="rounded bg-emerald-700 px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
              disabled={loading || !adminToken || !email || topicDraft.length === 0}
              onClick={() => void createSubscription('test')}
            >
              测试开关
            </button>
            <button
              className="rounded bg-indigo-600 px-4 py-2 text-sm hover:bg-indigo-500 disabled:opacity-50"
              disabled={loading || !adminToken || !email || topicDraft.length === 0}
              onClick={() => void createSubscription('create')}
            >
              创建开关
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {rows.map((s) => (
            <div key={s.id} className="rounded border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex justify-between items-start gap-3">
                <div className="text-sm">
                  <div className="font-medium">{s.email}</div>
                  <div className="text-zinc-400">
                    {s.timezone} · {s.deliverTimeLocal} · 主题 {s.topics?.length ?? 0} 个
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded bg-emerald-700 px-3 py-1 text-xs hover:bg-emerald-600 disabled:opacity-50"
                    onClick={() => void testSend(s.id)}
                    disabled={loading || !adminToken}
                  >
                    测试发送
                  </button>
                  <button
                    className="rounded bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50"
                    onClick={() => void toggleEnabled(s.id, !s.enabled)}
                    disabled={loading || !adminToken}
                  >
                    {s.enabled ? '停用' : '启用'}
                  </button>
                  <button
                    className="rounded bg-rose-700 px-3 py-1 text-xs hover:bg-rose-600 disabled:opacity-50"
                    onClick={() => void removeSub(s.id)}
                    disabled={loading || !adminToken}
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="text-zinc-500 text-sm">暂无订阅，先创建一个。</div>}
        </div>

        <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-300 min-h-[120px]">
          {resp || (loading ? '...' : '接口响应显示在这里')}
        </pre>
      </div>
    </div>
  );
}
