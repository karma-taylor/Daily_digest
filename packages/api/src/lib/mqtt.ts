import type { Env } from '../types/env';

/**
 * 通过可配置的 HTTPS Webhook 转发到 MQTT（需自建桥接服务，如 n8n / 小网关）。
 * Body: { topic, payload }
 */
export async function publishDigestMqtt(
  env: Env,
  topic: string,
  payload: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = env.MQTT_NOTIFY_URL;
  if (!url) {
    return { ok: false, error: 'MQTT_NOTIFY_URL not set' };
  }
  const secret = env.MQTT_NOTIFY_SECRET;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'X-Webhook-Secret': secret } : {}),
    },
    body: JSON.stringify({ topic, payload }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `${res.status} ${t.slice(0, 200)}` };
  }
  return { ok: true };
}
