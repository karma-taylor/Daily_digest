import type { DigestSourceKind } from '@hamhome/types';
import type { Env } from '../types/env';
import { fetchAndParseFeed } from './rss';
import { fetchPagePlain } from './url-fetch';
import { parseRssPublished } from './digest-recency';

export type NormalizedContentType = 'post' | 'article' | 'report' | 'paper' | 'video' | 'news';
export type NormalizedSourcePlatform = 'rss' | 'web' | 'youtube' | 'x';

export interface NormalizedContentItem {
  id: string;
  title: string;
  url: string;
  summary: string;
  body: string;
  author?: string;
  actor?: string;
  publishedAt?: Date;
  contentType: NormalizedContentType;
  platform: NormalizedSourcePlatform;
  sourceKind: DigestSourceKind;
  sourceTitle?: string | null;
  skipDateFilter?: boolean;
  isWatchlistSource?: boolean;
}

export interface SourceLike {
  kind: string;
  url: string;
  title?: string | null;
}

export interface WatchlistContext {
  name: string;
  entityType: 'person' | 'organization';
  aliases: string[];
}

type Adapter = (source: SourceLike, env: Env, context?: WatchlistContext) => Promise<NormalizedContentItem[]>;

const MAX_BODY_CHARS = 12000;
const MAX_PDF_BYTES = 4_000_000;

function makeId(kind: string, url: string, title: string): string {
  return `${kind}:${url}:${title}`.slice(0, 500);
}

function cleanText(text: string, max = MAX_BODY_CHARS): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function detectContentType(url: string, title: string, text: string): NormalizedContentType {
  const blob = `${url} ${title} ${text.slice(0, 500)}`.toLowerCase();
  if (blob.includes('arxiv.org') || blob.includes('paper') || blob.includes('论文')) return 'paper';
  if (blob.includes('.pdf') || blob.includes('report') || blob.includes('whitepaper') || blob.includes('报告')) return 'report';
  return 'article';
}

function actorFromTitle(source: SourceLike, context?: WatchlistContext): string | undefined {
  return context?.name || source.title || undefined;
}

function normalizeFeedItem(
  source: SourceLike,
  kind: DigestSourceKind,
  platform: NormalizedSourcePlatform,
  item: { title: string; url: string; summary: string; published?: string },
  context?: WatchlistContext,
): NormalizedContentItem {
  const publishedAt = parseRssPublished(item.published);
  const actor = actorFromTitle(source, context);
  const contentType: NormalizedContentType = platform === 'youtube' ? 'video' : platform === 'x' ? 'post' : detectContentType(item.url, item.title, item.summary);
  return {
    id: makeId(kind, item.url, item.title),
    title: item.title,
    url: item.url,
    summary: cleanText(item.summary, 2000),
    body: cleanText(item.summary),
    ...(actor ? { actor, author: actor } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    contentType,
    platform,
    sourceKind: kind,
    sourceTitle: source.title ?? null,
    isWatchlistSource: Boolean(context),
  };
}

async function extractPdfText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HamHome-Digest/1.0 (+https://hamhome.app)' },
  });
  if (!res.ok) throw new Error(`PDF fetch HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? '0');
  if (len > MAX_PDF_BYTES) throw new Error(`PDF too large (${len} bytes)`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_PDF_BYTES) throw new Error(`PDF too large (${buf.byteLength} bytes)`);
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return cleanText(Array.isArray(text) ? text.join('\n') : String(text));
}

async function rssAdapter(source: SourceLike, _env: Env, context?: WatchlistContext): Promise<NormalizedContentItem[]> {
  const items = await fetchAndParseFeed(source.url);
  return items.slice(0, 70).map((it) => normalizeFeedItem(source, 'rss', 'rss', it, context));
}

async function urlAdapter(source: SourceLike, _env: Env, context?: WatchlistContext): Promise<NormalizedContentItem[]> {
  const isPdf = /\.pdf(?:$|[?#])/i.test(source.url);
  const page = isPdf
    ? { title: source.title || source.url.split('/').pop() || source.url, text: await extractPdfText(source.url) }
    : await fetchPagePlain(source.url);
  const actor = actorFromTitle(source, context);
  const contentType = detectContentType(source.url, page.title, page.text);
  return [{
    id: makeId('url', source.url, page.title),
    title: page.title,
    url: source.url,
    summary: cleanText(page.text, 2000),
    body: cleanText(page.text),
    ...(actor ? { actor, author: actor } : {}),
    contentType,
    platform: 'web',
    sourceKind: 'url',
    sourceTitle: source.title ?? null,
    skipDateFilter: true,
    isWatchlistSource: Boolean(context),
  }];
}

function youtubeFeedUrl(input: string): string {
  if (/\/feeds\/videos\.xml/i.test(input)) return input;
  const url = new URL(input);
  const channelId = url.searchParams.get('channel_id') || url.pathname.match(/\/channel\/([^/?#]+)/)?.[1];
  if (!channelId) throw new Error('YouTube channel source requires a channel_id feed URL or /channel/<id> URL');
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

async function youtubeAdapter(source: SourceLike, env: Env, context?: WatchlistContext): Promise<NormalizedContentItem[]> {
  const feedSource = { ...source, url: youtubeFeedUrl(source.url) };
  const rows = await rssAdapter(feedSource, env, context);
  const out: NormalizedContentItem[] = [];
  for (const it of rows) {
    const transcript = await fetchYouTubeTranscript(it.url).catch(() => '');
    out.push({
      ...it,
      contentType: 'video',
      platform: 'youtube',
      sourceKind: 'youtube_channel',
      body: transcript || it.body || 'YouTube transcript unavailable; using RSS description.',
      summary: transcript ? transcript.slice(0, 2000) : it.summary,
    });
  }
  return out;
}

function youtubeVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    return url.searchParams.get('v')
      || url.pathname.match(/\/shorts\/([^/?#]+)/)?.[1]
      || (url.hostname.includes('youtu.be') ? url.pathname.replace(/^\//, '').split('/')[0] : null);
  } catch {
    return null;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchYouTubeTranscript(videoUrl: string): Promise<string> {
  const id = youtubeVideoId(videoUrl);
  if (!id) return '';
  const list = await fetch(`https://video.google.com/timedtext?type=list&v=${encodeURIComponent(id)}`);
  if (!list.ok) return '';
  const xml = await list.text();
  const tracks = [...xml.matchAll(/<track\b[^>]*lang_code="([^"]+)"[^>]*>/gi)].map((m) => m[1]);
  const lang = tracks.find((x) => /^zh/i.test(x)) || tracks.find((x) => /^en/i.test(x)) || tracks[0];
  if (!lang) return '';
  const res = await fetch(`https://video.google.com/timedtext?v=${encodeURIComponent(id)}&lang=${encodeURIComponent(lang)}`);
  if (!res.ok) return '';
  const body = await res.text();
  return cleanText(decodeEntities(body.replace(/<[^>]+>/g, ' ')));
}

function xProfileFeedUrl(input: string, base: string | undefined): string {
  if (/\/twitter\/user\//i.test(input) || /\/x\/user\//i.test(input)) return input;
  const rsshub = base?.trim().replace(/\/$/, '');
  if (!rsshub) throw new Error('RSSHUB_BASE_URL is required for x_profile sources');
  const handle = input
    .replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();
  if (!handle) throw new Error('x_profile source requires a handle or profile URL');
  return `${rsshub}/twitter/user/${encodeURIComponent(handle)}`;
}

async function xProfileAdapter(source: SourceLike, env: Env, context?: WatchlistContext): Promise<NormalizedContentItem[]> {
  const feedSource = { ...source, url: xProfileFeedUrl(source.url, env.RSSHUB_BASE_URL) };
  const rows = await rssAdapter(feedSource, env, context);
  return rows.map((it) => ({
    ...it,
    contentType: 'post',
    platform: 'x',
    sourceKind: 'x_profile',
  }));
}

export const contentAdapters: Record<DigestSourceKind, Adapter> = {
  rss: rssAdapter,
  url: urlAdapter,
  youtube_channel: youtubeAdapter,
  x_profile: xProfileAdapter,
};

export async function fetchSourceContent(source: SourceLike, env: Env, context?: WatchlistContext): Promise<NormalizedContentItem[]> {
  const kind = source.kind as DigestSourceKind;
  const adapter = contentAdapters[kind];
  if (!adapter) throw new Error(`Unsupported digest source kind: ${source.kind}`);
  return adapter(source, env, context);
}
