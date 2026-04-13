/**
 * 按订阅/用户 IANA 时区的「当地自然日」过滤 RSS 条目，避免把几天前仍排在 Feed 前列的旧闻送进摘要。
 */

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** 将 instant 格式化为该时区下的 YYYY-MM-DD（与 en-CA 约定一致，便于字符串比较） */
export function calendarYmdInTimeZone(instant: Date, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * 解析 RSS/Atom 常见日期串；无效则返回 null。
 */
export function parseRssPublished(raw: string | undefined): Date | null {
  if (raw == null || !String(raw).trim()) return null;
  const t = Date.parse(String(raw).trim());
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type RecencyFilterable = {
  publishedAt?: Date;
  /** 非 RSS（整页抓取）无可靠发布时间，不参与「当日」过滤 */
  skipDateFilter?: boolean;
};

/**
 * 仅保留「发布时间落在 timeZone 当地日历日 === now 的当地日历日」的条目；
 * skipDateFilter 的条目始终保留；无 publishedAt 的 RSS 条目丢弃。
 */
export function filterToLocalCalendarDay<T extends RecencyFilterable>(
  items: T[],
  timeZone: string,
  now: Date = new Date(),
): T[] {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const todayYmd = calendarYmdInTimeZone(now, tz);
  return items.filter((it) => {
    if (it.skipDateFilter) return true;
    if (!it.publishedAt) return false;
    return calendarYmdInTimeZone(it.publishedAt, tz) === todayYmd;
  });
}
