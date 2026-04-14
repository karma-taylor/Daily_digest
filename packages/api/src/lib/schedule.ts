/**
 * 每天定点触发（支持分钟）：与 wrangler `[triggers] crons` 的间隔对齐。
 *
 * 重要：若 cron 为每 10 分钟一次（如 `* /10 * * * *` 去掉空格），触发时刻在 UTC 上仅为整十分，映射到订阅者本地
 * 后往往**跳过**大量分钟（例如本地 :55–:59 可能整段都碰不到）。因此不能只看
 * `scheduledMs` 单点，而要看 **(scheduledMs - spacing, scheduledMs]** 区间内是否出现过
 * 落在投递窗口内的本地时间。
 */

const MS_PER_MINUTE = 60_000;

function parseDeliverHm(deliverTimeLocal: string): { hour: number; minute: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(deliverTimeLocal.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function getLocalHourMinute(ms: number, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(ms));
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '-1', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '-1', 10);
  return { hour, minute };
}

/** 本地「从 0 点起的分钟数」是否落在 [start, end)（支持 end 超过 1440 时跨午夜） */
function localMinuteInWindow(localMin: number, windowStartMin: number, windowEndMin: number): boolean {
  const DAY = 24 * 60;
  if (windowEndMin <= DAY) {
    return localMin >= windowStartMin && localMin < windowEndMin;
  }
  const tail = windowEndMin - DAY;
  return localMin >= windowStartMin || localMin < tail;
}

/**
 * 在「本次 scheduled 触发」对应的时间片内，订阅者本地是否曾进入过投递窗口。
 *
 * @param scheduledMs 本次 cron / scheduled 事件的 `scheduledTime`（毫秒）
 * @param deliverTimeLocal `HH:mm`
 * @param windowMinutes 投递窗口长度（默认 10，与原逻辑一致）
 * @param cronSpacingMs 与 wrangler crons 间隔一致（默认 10 分钟）
 */
export function shouldRunSubscriptionAtLocalTime(
  scheduledMs: number,
  timeZone: string,
  deliverTimeLocal: string,
  windowMinutes = 10,
  cronSpacingMs = 10 * MS_PER_MINUTE,
): boolean {
  const hm = parseDeliverHm(deliverTimeLocal);
  if (!hm) return false;

  const w = Math.max(1, windowMinutes);
  const windowStartMin = hm.hour * 60 + hm.minute;
  const windowEndMin = windowStartMin + w;

  const tEnd = scheduledMs;
  const tStart = scheduledMs - cronSpacingMs;

  for (
    let u = Math.floor(tEnd / MS_PER_MINUTE) * MS_PER_MINUTE;
    u > tStart;
    u -= MS_PER_MINUTE
  ) {
    const { hour, minute } = getLocalHourMinute(u, timeZone);
    const localMin = hour * 60 + minute;
    if (localMinuteInWindow(localMin, windowStartMin, windowEndMin)) return true;
  }

  return false;
}
