/**
 * 在「每日投递截止小时」之前完成：默认在本地 (deliverHourLocal - 1) 点这一小时触发一次任务。
 * 例如 deliverHourLocal=8 → 在用户本地 07:00–07:59 内 scheduled 命中时执行。
 */
export function shouldRunDigestThisHour(
  scheduledMs: number,
  timeZone: string,
  deliverHourLocal: number,
): boolean {
  const runHour = ((deliverHourLocal % 24) + 24 - 1) % 24;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(scheduledMs));
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '-1', 10);
  return h === runHour;
}
