/**
 * 将去重后的条目按「主题关键词」分桶，每桶最多 maxItems 条（默认 15）。
 * 每条 URL 只归入得分最高的一个主题。
 */

export type TopicBucketConfig = {
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

export type AggItem = {
  title: string;
  url: string;
  summary: string;
  /** RSS pubDate / Atom updated，用于「仅当地当日」过滤 */
  publishedAt?: Date;
  /** 整页 URL 源无可靠发布日，不参与日历日过滤 */
  skipDateFilter?: boolean;
};

/** 可直接用于 PUT /v1/digest/settings 的 topics：伊朗局势 + AI */
export const DEFAULT_IRAN_AI_TOPICS: TopicBucketConfig[] = [
  {
    label: '每日伊朗局势',
    maxItems: 15,
    keywords: [
      'iran', 'iranian', 'tehran', 'persian', 'qom', 'isfahan',
      'strait of hormuz', 'hormuz', 'middle east', 'persian gulf',
      'israel', 'gaza', 'hezbollah', 'houthis', 'houthi',
      'sanction', 'nuclear', 'iaea', 'opec',
      '伊朗', '德黑兰', '波斯', '中东', '霍尔木兹', '核', '制裁', '以伊', '伊以',
    ],
  },
  {
    label: '每日 AI 发展',
    maxItems: 15,
    keywords: [
      'artificial intelligence', 'machine learning', 'deep learning',
      'neural', 'llm', 'gpt', 'openai', 'anthropic', 'claude', 'gemini',
      'deepseek', 'mistral', 'transformer', 'diffusion', 'embedding',
      'fine-tun', 'inference', 'gpu', 'cuda', 'tpu',
      '人工智能', '大模型', '机器学习', '深度学习', 'ChatGPT', '多模态',
    ],
  },
];

function scoreItemAgainstTopic(blob: string, kws: string[]): number {
  let s = 0;
  for (const k of kws) {
    const q = k.trim().toLowerCase();
    if (!q) continue;
    if (blob.includes(q)) s += 1;
  }
  return s;
}

export function partitionItemsIntoTopicBuckets(
  items: AggItem[],
  topics: TopicBucketConfig[],
): { category: string; items: AggItem[] }[] {
  if (topics.length === 0) return [];

  const normalized = topics.map((t) => ({
    category: t.label,
    max: Math.min(40, Math.max(1, t.maxItems ?? 15)),
    kws: t.keywords.map((k) => k.toLowerCase()),
  }));

  const buckets: AggItem[][] = normalized.map(() => []);
  const used = new Set<string>();

  const scored = items.map((it) => {
    const blob = `${it.title} ${it.summary}`.toLowerCase();
    const scores = normalized.map((n) => scoreItemAgainstTopic(blob, n.kws));
    const best = Math.max(...scores, 0);
    let idx = -1;
    if (best > 0) idx = scores.indexOf(best);
    return { it, idx, best };
  });

  scored.sort((a, b) => b.best - a.best);

  for (const row of scored) {
    if (row.idx < 0) continue;
    const url = row.it.url;
    if (used.has(url)) continue;
    const cap = normalized[row.idx].max;
    if (buckets[row.idx].length >= cap) continue;
    buckets[row.idx].push(row.it);
    used.add(url);
  }

  return normalized.map((n, i) => ({ category: n.category, items: buckets[i] }));
}
