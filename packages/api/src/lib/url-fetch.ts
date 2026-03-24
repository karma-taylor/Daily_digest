/**
 * 非 RSS 的指定 URL：拉取 HTML 并抽取可读纯文本（轻量，非 Readability）。
 */
export async function fetchPagePlain(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HamHome-Digest/1.0 (+https://hamhome.app)' },
  });
  if (!res.ok) throw new Error(`URL fetch HTTP ${res.status}`);
  const html = await res.text();
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? url;
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
  return { title, text };
}
