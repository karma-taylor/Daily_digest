'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';

type Topic = {
  label: string;
  keywords: string[];
  maxItems?: number;
  watchlist?: {
    name: string;
    entityType: 'person' | 'organization';
    aliases: string[];
    sources: { kind: 'rss' | 'url' | 'youtube_channel' | 'x_profile'; url: string }[];
  }[];
};
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
  return input.split(',').map((s) => s.trim()).filter(Boolean).slice(0, limit);
}

export default function DigestConsolePage() {
  const [base, setBase] = useState(process.env.NEXT_PUBLIC_DIGEST_API_URL ?? 'https://hamhome-api.hamhome-680ce447.workers.dev');
  const [adminToken, setAdminToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [testStatus, setTestStatus] = useState('Pending');
  const [createdSub, setCreatedSub] = useState<Subscription | null>(null);
  const [rows, setRows] = useState<Subscription[]>([]);

  const [email, setEmail] = useState('');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [deliverTimeLocal, setDeliverTimeLocal] = useState('09:00');
  const [enabled, setEnabled] = useState(true);
  const [hourlyEnabled, setHourlyEnabled] = useState(false);
  const [maxItemsPerTopic, setMaxItemsPerTopic] = useState(10);
  const [topicInput, setTopicInput] = useState('每日 AI 发展, 行业快讯');
  const [keywordInput, setKeywordInput] = useState('ai, llm, openai');
  const [watchlistInput, setWatchlistInput] = useState('[{"name":"Google DeepMind","entityType":"organization","aliases":["Gemini","DeepMind"],"sources":[{"kind":"youtube_channel","url":"https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg"}]}]');

  useEffect(() => {
    const saved = window.localStorage.getItem('digest_admin_token') ?? '';
    if (saved) setAdminToken(saved);
  }, []);

  useEffect(() => {
    if (!adminToken) return;
    void loadSubscriptions();
  }, [adminToken]);

  const topicDraft = useMemo(() => {
    const labels = splitCsv(topicInput, MAX_TOPICS);
    const keywords = splitCsv(keywordInput, MAX_KEYWORDS);
    let watchlist: Topic['watchlist'] = [];
    try {
      const parsed = JSON.parse(watchlistInput || '[]') as unknown;
      watchlist = Array.isArray(parsed) ? parsed as Topic['watchlist'] : [];
    } catch {
      watchlist = [];
    }
    if (labels.length === 0 || keywords.length === 0) return [];
    return labels.map((label) => ({ label, keywords, maxItems: maxItemsPerTopic, ...(watchlist?.length ? { watchlist } : {}) }));
  }, [topicInput, keywordInput, maxItemsPerTopic, watchlistInput]);

  async function call(path: string, init?: RequestInit) {
    try {
      const r = await fetch(`${base.replace(/\/$/, '')}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
          ...(init?.headers || {}),
        },
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) return { success: false, data: null };
      return j;
    } catch {
      return { success: false, data: null };
    }
  }

  async function loadSubscriptions() {
    setLoading(true);
    try {
      const j = await call('/v1/digest/subscriptions');
      const list = Array.isArray(j?.data) ? (j.data as Subscription[]) : [];
      setRows(list);
      if (createdSub) {
        const latest = list.find((x) => x.id === createdSub.id);
        if (latest) {
          setCreatedSub(latest);
        } else if (list[0]) {
          setCreatedSub(list[0]);
        }
      } else if (list[0]) {
        setCreatedSub(list[0]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createSubscription(mode: 'create' | 'test') {
    setLoading(true);
    try {
      const created = await call('/v1/digest/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ email, timezone, deliverTimeLocal, topics: topicDraft, enabled, maxItemsPerTopic }),
      });

      if (!created?.success || !created?.data?.id) {
        if (mode === 'test') setTestStatus('Failed');
        return;
      }

      setCreatedSub(created.data as Subscription);
      const createdId = created.data.id as string;

      if (mode === 'test') {
        const testRes = await call(`/v1/digest/subscriptions/${createdId}/test`, { method: 'POST' });
        setTestStatus(testRes?.success ? 'Success' : 'Failed');
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
      if (createdSub?.id === id) {
        setCreatedSub({ ...createdSub, enabled: next });
      }
      await loadSubscriptions();
    } finally {
      setLoading(false);
    }
  }

  async function testSend(id: string) {
    setLoading(true);
    try {
      const r = await call(`/v1/digest/subscriptions/${id}/test`, { method: 'POST' });
      setTestStatus(r?.success ? 'Success' : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function removeSub(id: string) {
    setLoading(true);
    try {
      await call(`/v1/digest/subscriptions/${id}`, { method: 'DELETE' });
      if (createdSub?.id === id) setCreatedSub(null);
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="space-y-1">
              <label className="text-sm text-zinc-300">邮箱地址</label>
              <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-zinc-300">时区</label>
              <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Shanghai" />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-zinc-300">{hourlyEnabled ? '发送起始时间' : '发送时间'}</label>
              <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={deliverTimeLocal} onChange={(e) => setDeliverTimeLocal(e.target.value)} placeholder="HH:mm" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-zinc-300">发送模式</label>
              <div className="grid grid-cols-[1.1fr_0.9fr] gap-2">
                <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950 px-2 py-2 h-[42px]">
                  <label className="flex items-center gap-1 text-sm text-zinc-300"><input className="h-4 w-4" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />定时发送</label>
                  <label className="flex items-center gap-1 text-sm text-zinc-300"><input className="h-4 w-4" type="checkbox" checked={hourlyEnabled} onChange={(e) => setHourlyEnabled(e.target.checked)} />每小时发送</label>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-2 h-[42px] flex items-center gap-2">
                  <span className="text-xs text-zinc-400">每主题</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-14 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm"
                    value={maxItemsPerTopic}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      setMaxItemsPerTopic(Math.max(1, Math.min(10, n)));
                    }}
                  />
                  <span className="text-xs text-zinc-400">&lt;=10</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm text-zinc-300">主题</label>
              <div className="text-xs text-zinc-500">最多三个主题，逗号分隔</div>
              <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={topicInput} onChange={(e) => setTopicInput(e.target.value)} placeholder="每日 AI 发展, 行业快讯" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-zinc-300">关键词</label>
              <div className="text-xs text-zinc-500">最多五个关键词，逗号分隔</div>
              <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} placeholder="ai, llm, openai" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm text-zinc-300">关注人物/机构 JSON</label>
              <div className="text-xs text-zinc-500">会附加到每个主题；支持 x_profile / youtube_channel / rss / url。</div>
              <textarea
                className="h-28 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs"
                value={watchlistInput}
                onChange={(e) => setWatchlistInput(e.target.value)}
                placeholder='[{"name":"Gemini CEO","entityType":"person","aliases":["..."],"sources":[{"kind":"x_profile","url":"https://x.com/..."}]}]'
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-1">
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50" disabled={loading || !adminToken || !email || topicDraft.length === 0} onClick={() => void createSubscription('test')}>测试</button>
            <button className="rounded bg-indigo-600 px-4 py-2 text-sm hover:bg-indigo-500 disabled:opacity-50" disabled={loading || !adminToken || !email || topicDraft.length === 0} onClick={() => void createSubscription('create')}>创建</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300 min-h-[120px]">
            <div className="font-medium mb-2">测试</div>
            <div>{loading ? 'Running...' : `状态: ${testStatus}`}</div>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300 min-h-[120px]">
            <div className="font-medium mb-2">创建好的订阅</div>
            {!createdSub ? (
              <div>暂无</div>
            ) : (
              <div className="space-y-1">
                <div>{createdSub.email}</div>
                <div className="text-zinc-400">{createdSub.timezone} · {createdSub.deliverTimeLocal}</div>
                <div className="text-zinc-400">状态: {createdSub.enabled ? '启用' : '停用'}</div>
                <div className="text-zinc-400">主题数: {createdSub.topics?.length ?? 0}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
