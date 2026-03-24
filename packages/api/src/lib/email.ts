import type { Env } from '../types/env';

/**
 * Resend HTTP API：https://resend.com/docs/api-reference/emails/send-email
 */
export async function sendHtmlEmail(
  env: Env,
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const key = env.RESEND_API_KEY;
  const from = env.RESEND_FROM;
  if (!key || !from) {
    return { ok: false, error: 'RESEND_API_KEY or RESEND_FROM not set' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `${res.status} ${t.slice(0, 300)}` };
  }
  return { ok: true };
}
