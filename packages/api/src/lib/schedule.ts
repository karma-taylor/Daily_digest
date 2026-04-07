/**
 * 每天定点触发（支持分钟）：只在本地时间位于目标 minute 窗口内返回 true。
 * deliverTimeLocal 格式：HH:mm
 */
export function shouldRunSubscriptionAtLocalTime(
  scheduledMs: number,
  timeZone: string,
  deliverTimeLocal: string,
  windowMinutes = 10,
): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(deliverTimeLocal.trim());
  if (!m) return false;

  const targetHour = Number(m[1]);
  const targetMinute = Number(m[2]);
  if (!Number.isInteger(targetHour) || !Number.isInteger(targetMinute)) return false;
  if (targetHour < 0 || targetHour > 23 || targetMinute < 0 || targetMinute > 59) return false;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(scheduledMs));

  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '-1');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '-1');
  if (h !== targetHour) return false;

  const delta = mm - targetMinute;
  return delta >= 0 && delta < Math.max(1, windowMinutes);
}
