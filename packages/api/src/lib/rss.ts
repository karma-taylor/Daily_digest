import { XMLParser } from 'fast-xml-parser';

export interface RawFeedItem {
  title: string;
  url: string;
  summary: string;
  published?: string;
}

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function pickText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && v !== null && '#text' in v) return String((v as { '#text': unknown })['#text']).trim();
  return String(v).trim();
}

/**
 * 解析 RSS 2.0 / Atom（常见字段），失败返回空数组。
 */
function resolveHref(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

export function parseFeedXml(xml: string, sourceUrl: string): RawFeedItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  let root: unknown;
  try {
    root = parser.parse(xml);
  } catch {
    return [];
  }
  if (!root || typeof root !== 'object') return [];

  const o = root as Record<string, unknown>;

  // RSS 2.0
  const rss = o.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  if (channel?.item) {
    return asArray(channel.item).map((it) => {
      const row = it as Record<string, unknown>;
      const title = pickText(row.title);
      const link = pickText(row.link) || pickText(row.guid);
      const summary = pickText(row.description || row['content:encoded'])
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const published = row.pubDate != null ? pickText(row.pubDate) : undefined;
      const url = link ? resolveHref(link, sourceUrl) : '';
      return { title: title || url, url: url || title, summary, published };
    }).filter((x) => x.url);
  }

  // Atom
  const feed = o.feed as Record<string, unknown> | undefined;
  if (feed?.entry) {
    return asArray(feed.entry).map((it) => {
      const row = it as Record<string, unknown>;
      const title = pickText(row.title);
      let link = '';
      const links = row.link;
      if (Array.isArray(links)) {
        const alts = links.find((l) => (l as { rel?: string }).rel === 'alternate') as { href?: string } | undefined;
        link = String(alts?.href ?? (links[0] as { href?: string })?.href ?? '');
      } else if (links && typeof links === 'object') {
        link = String((links as { href?: string }).href ?? '');
      }
      const summary = pickText(row.summary ?? row.content)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const published = row.updated != null ? String(row.updated) : row.published != null ? String(row.published) : undefined;
      const url = link ? resolveHref(link, sourceUrl) : '';
      return { title: title || url, url: url || title, summary, published };
    }).filter((x) => x.url);
  }

  return [];
}

export async function fetchAndParseFeed(feedUrl: string): Promise<RawFeedItem[]> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': 'HamHome-Digest/1.0 (+https://hamhome.app)' },
  });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  return parseFeedXml(xml, feedUrl);
}
