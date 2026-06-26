import type { LlmDigestResult } from './llm';
import type { StructuredDigestItem, StructuredDigestResult } from './structured-digest';

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

function renderStructuredItems(items: StructuredDigestItem[]): string {
  if (items.length === 0) {
    return '<p style="margin:0 0 12px;color:#94a3b8;font-size:13px;">今日暂无入选条目。</p>';
  }
  return `<ul style="margin:0 0 14px;padding-left:20px;color:#475569;font-size:14px;line-height:1.6;">
    ${items.map((item) => {
      const meta = [
        item.actor,
        item.publishedAt ? item.publishedAt.slice(0, 10) : null,
        item.platform,
        `重要性 ${item.importanceScore}`,
      ].filter(Boolean).join(' · ');
      return `<li style="margin-bottom:10px;">
        <a href="${escapeHtml(item.url)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(item.title)}</a>
        <div style="color:#64748b;font-size:12px;margin-top:2px;">${escapeHtml(meta)}</div>
        <div>${escapeHtml(item.summary)}</div>
        <div style="color:#334155;"><strong>重要性：</strong>${escapeHtml(item.whyImportant)}</div>
      </li>`;
    }).join('')}
  </ul>`;
}

export function renderStructuredDigestEmailHtml(
  result: StructuredDigestResult,
  meta: { runId: string; generatedAt: string; title?: string },
): string {
  const topicsHtml = result.topics.map((topic) => `
<section style="margin-bottom:26px;font-family:system-ui,-apple-system,sans-serif;">
  <h2 style="color:#0f172a;font-size:18px;margin:0 0 10px;">${escapeHtml(topic.topic)}</h2>
  <h3 style="color:#1e293b;font-size:15px;margin:14px 0 6px;">1. 今日核心判断</h3>
  <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.5;">${escapeHtml(topic.coreJudgment)}</p>
  <h3 style="color:#1e293b;font-size:15px;margin:14px 0 6px;">2. 关键人物与机构动态</h3>
  ${renderStructuredItems(topic.keyPeopleAndOrganizations)}
  <h3 style="color:#1e293b;font-size:15px;margin:14px 0 6px;">3. 重要报告、论文与深度内容</h3>
  ${renderStructuredItems(topic.reportsAndDeepDives)}
  <h3 style="color:#1e293b;font-size:15px;margin:14px 0 6px;">4. 视频与自媒体内容</h3>
  ${renderStructuredItems(topic.videosAndCreatorMedia)}
  <h3 style="color:#1e293b;font-size:15px;margin:14px 0 6px;">5. 其他媒体资讯</h3>
  ${renderStructuredItems(topic.otherMedia)}
</section>`).join('');

  const errorsHtml = result.sourceErrors.length
    ? `<section style="margin-top:16px;padding:12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-family:system-ui;">
        <h3 style="font-size:14px;color:#9a3412;margin:0 0 6px;">来源抓取提示</h3>
        <ul style="margin:0;padding-left:18px;color:#9a3412;font-size:12px;">${result.sourceErrors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
      </section>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="background:#f8fafc;padding:24px;margin:0;">
<div style="max-width:720px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
  <h1 style="font-family:system-ui;font-size:20px;color:#0f172a;margin:0 0 8px;">${escapeHtml(meta.title ?? 'HamHome Topic Digest')}</h1>
  <p style="margin:0 0 20px;color:#64748b;font-size:13px;">生成时间 ${escapeHtml(meta.generatedAt)} · Run ${escapeHtml(meta.runId)}</p>
  ${topicsHtml}
  ${errorsHtml}
  <p style="color:#94a3b8;font-size:12px;margin-top:24px;">本邮件由 HamHome Digest 自动发送。</p>
</div></body></html>`;
}
