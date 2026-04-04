import type { LlmDigestResult } from './llm';

export function renderDigestEmailHtml(
  result: LlmDigestResult,
  meta: { runId: string; generatedAt: string; title?: string },
): string {
  const sectionsHtml = result.sections
    .map(
      (s) => `
<section style="margin-bottom:20px;font-family:system-ui,-apple-system,sans-serif;">
  <h2 style="color:#1e293b;font-size:16px;margin:0 0 8px;">${escapeHtml(s.category)}</h2>
  <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.5;"><strong>核心：</strong>${escapeHtml(s.one_line)}</p>
  <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.6;">
    ${s.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
  </ul>
</section>`,
    )
    .join('');

  let chartHtml = '';
  if (result.chart && result.chart.rows.length > 0) {
    const th = result.chart.headers.map((h) => `<th style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(h)}</th>`).join('');
    const trs = result.chart.rows
      .map(
        (row) =>
          `<tr>${row.map((c) => `<td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(c)}</td>`).join('')}</tr>`,
      )
      .join('');
    chartHtml = `
<section style="margin:20px 0;font-family:system-ui;">
  <h3 style="font-size:15px;color:#1e293b;">${escapeHtml(result.chart.title)}</h3>
  <table style="border-collapse:collapse;width:100%;max-width:560px;font-size:13px;">
    ${th ? `<thead><tr>${th}</tr></thead>` : ''}
    <tbody>${trs}</tbody>
  </table>
</section>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="background:#f8fafc;padding:24px;margin:0;">
<div style="max-width:640px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
  <h1 style="font-family:system-ui;font-size:20px;color:#0f172a;margin:0 0 8px;">${escapeHtml(meta.title ?? 'HamHome 资讯日报')}</h1>
  <p style="margin:0 0 20px;color:#64748b;font-size:13px;">生成时间 ${escapeHtml(meta.generatedAt)} · Run ${escapeHtml(meta.runId)}</p>
  ${sectionsHtml}
  ${chartHtml}
  <p style="color:#94a3b8;font-size:12px;margin-top:24px;">本邮件由 HamHome Digest 自动发送</p>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
