/** 简单去重：规范化 URL + 标题指纹 */

export function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = '';
    x.searchParams.sort();
    return x.toString();
  } catch {
    return u.trim().toLowerCase();
  }
}

export function dedupeByUrlAndTitle<T extends { url: string; title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = `${normalizeUrl(it.url)}|${it.title.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
