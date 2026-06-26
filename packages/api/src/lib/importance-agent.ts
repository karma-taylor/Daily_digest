import type { Env } from '../types/env';
import type { NormalizedContentItem, NormalizedContentType } from './content-adapters';
import type { TopicBucketConfig } from './topic-buckets';

export interface ImportanceReview {
  itemId: string;
  relevanceScore: number;
  importanceScore: number;
  contentType: NormalizedContentType;
  actor?: string;
  keyClaims: string[];
  whyImportant: string;
  confidence: number;
  selected: boolean;
}

function extractJson(text: string): string {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function keywordScore(item: NormalizedContentItem, topic: TopicBucketConfig): number {
  const blob = `${item.title} ${item.summary} ${item.body} ${item.actor ?? ''} ${item.author ?? ''}`.toLowerCase();
  const aliases = topic.watchlist?.flatMap((w) => [w.name, ...w.aliases]) ?? [];
  const terms = [...topic.keywords, ...aliases].map((x) => x.trim().toLowerCase()).filter(Boolean);
  let score = 0;
  for (const term of terms) {
    if (blob.includes(term)) score += 10;
  }
  return Math.min(100, score);
}

function fallbackScore(item: NormalizedContentItem, topic: TopicBucketConfig): ImportanceReview {
  const relevanceScore = Math.max(keywordScore(item, topic), item.isWatchlistSource ? 80 : 0);
  const typeBonus: Record<NormalizedContentType, number> = {
    report: 25,
    paper: 25,
    video: 18,
    post: 16,
    article: 12,
    news: 8,
  };
  const primaryBonus = item.isWatchlistSource ? 30 : 0;
  const importanceScore = Math.min(100, relevanceScore + primaryBonus + typeBonus[item.contentType]);
  return {
    itemId: item.id,
    relevanceScore,
    importanceScore,
    contentType: item.contentType,
    actor: item.actor || item.author,
    keyClaims: [item.summary || item.title].filter(Boolean).slice(0, 1),
    whyImportant: item.isWatchlistSource
      ? '来自主题关注名单的一手来源，按确定性降级规则优先保留。'
      : `${item.contentType} 内容按主题关键词匹配和类型优先级排序。`,
    confidence: item.summary || item.body ? 70 : 45,
    selected: relevanceScore > 0 || Boolean(item.isWatchlistSource),
  };
}

function normalizeReviews(raw: unknown, items: NormalizedContentItem[], topic: TopicBucketConfig): ImportanceReview[] {
  const p = raw as Record<string, unknown>;
  const rows = Array.isArray(p.reviews) ? p.reviews : [];
  const byId = new Map(items.map((it) => [it.id, it]));
  const reviewed: ImportanceReview[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const itemId = String(r.itemId ?? '');
    const item = byId.get(itemId);
    if (!item) continue;
    reviewed.push({
      itemId,
      relevanceScore: clampScore(r.relevanceScore),
      importanceScore: clampScore(r.importanceScore),
      contentType: (String(r.contentType || item.contentType) as NormalizedContentType),
      actor: r.actor == null ? item.actor || item.author : String(r.actor),
      keyClaims: Array.isArray(r.keyClaims) ? r.keyClaims.map((x) => String(x)).slice(0, 4) : [],
      whyImportant: String(r.whyImportant ?? ''),
      confidence: clampScore(r.confidence),
      selected: Boolean(r.selected),
    });
  }
  const seen = new Set(reviewed.map((r) => r.itemId));
  return reviewed.concat(items.filter((it) => !seen.has(it.id)).map((it) => fallbackScore(it, topic)));
}

export async function reviewTopicImportance(
  env: Env,
  topic: TopicBucketConfig,
  items: NormalizedContentItem[],
): Promise<ImportanceReview[]> {
  const key = env.LLM_API_KEY;
  if (!key || items.length === 0) return items.map((it) => fallbackScore(it, topic));

  const base = env.LLM_API_BASE?.replace(/\/$/, '') ?? 'https://api.openai.com/v1';
  const model = env.LLM_MODEL ?? 'gpt-4o-mini';
  const watchlist = topic.watchlist?.map((w) => ({
    name: w.name,
    entityType: w.entityType,
    aliases: w.aliases,
  })) ?? [];
  const payload = items.slice(0, 80).map((it) => ({
    itemId: it.id,
    title: it.title,
    actor: it.actor || it.author,
    platform: it.platform,
    contentType: it.contentType,
    isWatchlistSource: Boolean(it.isWatchlistSource),
    publishedAt: it.publishedAt?.toISOString(),
    url: it.url,
    text: (it.body || it.summary).slice(0, 1800),
  }));

  const system = `你是日报的重要性评审 Agent，只负责给候选条目打分和筛选，不写邮件。
必须且仅输出 JSON 对象：
{"reviews":[{"itemId":"...","relevanceScore":0-100,"importanceScore":0-100,"contentType":"post|article|report|paper|video|news","actor":"人物或机构","keyClaims":["..."],"whyImportant":"...","confidence":0-100,"selected":true}]}
评分维度：主题相关度、人物/机构影响力、是否一手信息、内容类型、时效性、潜在行业影响。
优先选择关注名单的一手内容、重要报告/论文、关键视频/访谈，然后才是普通媒体资讯。`;

  const user = JSON.stringify({
    topic: { label: topic.label, keywords: topic.keywords, watchlist },
    items: payload,
  });

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 6144,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user.slice(0, 56000) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM empty content');
    return normalizeReviews(JSON.parse(extractJson(content)), items, topic);
  } catch (e) {
    console.warn('[importance-agent] fallback', e);
    return items.map((it) => fallbackScore(it, topic));
  }
}
