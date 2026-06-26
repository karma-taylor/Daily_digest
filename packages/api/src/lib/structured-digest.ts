import type { Env } from '../types/env';
import type { SourceLike, WatchlistContext, NormalizedContentItem, NormalizedContentType } from './content-adapters';
import { fetchSourceContent } from './content-adapters';
import type { TopicBucketConfig } from './topic-buckets';
import { partitionItemsIntoTopicBuckets } from './topic-buckets';
import { dedupeByUrlAndTitle } from './dedup';
import { filterToLocalCalendarDay } from './digest-recency';
import { reviewTopicImportance, type ImportanceReview } from './importance-agent';

export interface StructuredDigestItem {
  title: string;
  url: string;
  actor?: string;
  summary: string;
  whyImportant: string;
  publishedAt?: string;
  platform: string;
  contentType: NormalizedContentType;
  importanceScore: number;
}

export interface StructuredTopicDigest {
  topic: string;
  coreJudgment: string;
  keyPeopleAndOrganizations: StructuredDigestItem[];
  reportsAndDeepDives: StructuredDigestItem[];
  videosAndCreatorMedia: StructuredDigestItem[];
  otherMedia: StructuredDigestItem[];
}

export interface StructuredDigestResult {
  topics: StructuredTopicDigest[];
  sourceErrors: string[];
}

export async function collectDigestItems(
  env: Env,
  sources: SourceLike[],
  topics: TopicBucketConfig[],
): Promise<{ items: NormalizedContentItem[]; sourceErrors: string[] }> {
  const allSources: { source: SourceLike; context?: WatchlistContext }[] = sources.map((source) => ({ source }));
  for (const topic of topics) {
    for (const target of topic.watchlist ?? []) {
      for (const source of target.sources) {
        allSources.push({
          source,
          context: {
            name: target.name,
            entityType: target.entityType,
            aliases: target.aliases,
          },
        });
      }
    }
  }

  const items: NormalizedContentItem[] = [];
  const sourceErrors: string[] = [];
  for (const row of allSources) {
    try {
      items.push(...await fetchSourceContent(row.source, env, row.context));
    } catch (e) {
      sourceErrors.push(`${row.source.kind} ${row.source.url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { items, sourceErrors };
}

function topicMatches(item: NormalizedContentItem, topic: TopicBucketConfig): boolean {
  const aliases = topic.watchlist?.flatMap((w) => [w.name, ...w.aliases]) ?? [];
  const terms = [...topic.keywords, ...aliases].map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (item.isWatchlistSource && item.actor && aliases.some((x) => x.toLowerCase() === item.actor?.toLowerCase())) return true;
  const blob = `${item.title} ${item.summary} ${item.body} ${item.actor ?? ''}`.toLowerCase();
  return terms.some((term) => blob.includes(term));
}

function itemSummary(item: NormalizedContentItem, review: ImportanceReview): string {
  const claim = review.keyClaims.find(Boolean);
  if (claim) return claim;
  return (item.summary || item.body || item.title).slice(0, 280);
}

function toStructuredItem(item: NormalizedContentItem, review: ImportanceReview): StructuredDigestItem {
  return {
    title: item.title,
    url: item.url,
    actor: review.actor || item.actor || item.author,
    summary: itemSummary(item, review),
    whyImportant: review.whyImportant || '入选原因来自重要性评审 Agent 或确定性降级规则。',
    publishedAt: item.publishedAt?.toISOString(),
    platform: item.platform,
    contentType: review.contentType,
    importanceScore: review.importanceScore,
  };
}

function pushByType(topic: StructuredTopicDigest, item: StructuredDigestItem, isWatchlist: boolean): void {
  if (isWatchlist || item.contentType === 'post') {
    topic.keyPeopleAndOrganizations.push(item);
    return;
  }
  if (item.contentType === 'report' || item.contentType === 'paper') {
    topic.reportsAndDeepDives.push(item);
    return;
  }
  if (item.contentType === 'video') {
    topic.videosAndCreatorMedia.push(item);
    return;
  }
  topic.otherMedia.push(item);
}

function coreJudgment(topic: string, items: StructuredDigestItem[], errors: string[]): string {
  if (items.length === 0) {
    return errors.length > 0
      ? `${topic} 今日未筛出高置信条目，且有部分来源抓取失败。`
      : `${topic} 今日未筛出高置信条目。`;
  }
  const top = items[0];
  const actor = top.actor ? `${top.actor} 的` : '';
  return `${topic} 今日最值得关注的是${actor}${top.contentType}：${top.title}。`;
}

export async function buildStructuredDigest(
  env: Env,
  sources: SourceLike[],
  topics: TopicBucketConfig[],
  timeZone: string,
  caps?: { totalCap?: number; perTopicCap?: number },
): Promise<StructuredDigestResult> {
  const { items, sourceErrors } = await collectDigestItems(env, sources, topics);
  const deduped = filterToLocalCalendarDay(dedupeByUrlAndTitle(items), timeZone);
  const perTopicCap = Math.max(1, Math.min(40, caps?.perTopicCap ?? 15));
  const totalCap = Math.max(1, Math.min(200, caps?.totalCap ?? 50));
  const buckets = partitionItemsIntoTopicBuckets(deduped, topics.map((t) => ({ ...t, maxItems: Math.min(t.maxItems ?? perTopicCap, perTopicCap) })));
  const topicResults: StructuredTopicDigest[] = [];
  let remaining = totalCap;

  for (const topic of topics) {
    const bucketItems = (buckets.find((b) => b.category === topic.label)?.items as NormalizedContentItem[] | undefined)
      ?? deduped.filter((item) => topicMatches(item, topic)).slice(0, perTopicCap);
    const reviews = await reviewTopicImportance(env, topic, bucketItems);
    const byId = new Map(bucketItems.map((it) => [it.id, it]));
    const selected = reviews
      .filter((r) => r.selected && byId.has(r.itemId))
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, Math.min(perTopicCap, remaining));
    remaining -= selected.length;

    const structured: StructuredTopicDigest = {
      topic: topic.label,
      coreJudgment: '',
      keyPeopleAndOrganizations: [],
      reportsAndDeepDives: [],
      videosAndCreatorMedia: [],
      otherMedia: [],
    };
    const allStructured: StructuredDigestItem[] = [];
    for (const review of selected) {
      const item = byId.get(review.itemId);
      if (!item) continue;
      const s = toStructuredItem(item, review);
      allStructured.push(s);
      pushByType(structured, s, Boolean(item.isWatchlistSource));
    }
    structured.coreJudgment = coreJudgment(topic.label, allStructured, sourceErrors);
    topicResults.push(structured);
  }

  return { topics: topicResults, sourceErrors };
}
