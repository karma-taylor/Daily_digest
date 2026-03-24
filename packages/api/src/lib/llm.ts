import type { Env } from '../types/env';

export interface LlmDigestResult {
  sections: { category: string; one_line: string; bullets: string[] }[];
  chart: { title: string; headers: string[]; rows: string[][] } | null;
}

function extractJson(text: string): string {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

/**
 * OpenAI 兼容 Chat Completions（DeepSeek / 通义网关 / OpenAI 等）。
 */
export async function generateDigestWithLlm(env: Env, userBlob: string): Promise<LlmDigestResult | null> {
  const base = env.LLM_API_BASE?.replace(/\/$/, '') ?? 'https://api.openai.com/v1';
  const key = env.LLM_API_KEY;
  const model = env.LLM_MODEL ?? 'gpt-4o-mini';
  if (!key) return null;

  const system = `你是专业资讯编辑。根据输入的多条摘录，输出且仅输出一个 JSON 对象，结构为：
{
  "sections": [
    { "category": "政治|经济|科技|社会|国际|行业|其他", "one_line": "一句话要点", "bullets": ["细节1","细节2","细节3"] }
  ],
  "chart": null 或 { "title": "图表标题", "headers": ["列A","列B"], "rows": [["1","2"],["3","4"]] }（仅当输入中有可表格化的数值对比时）
}
要求：去重相近信息；客观中性；sections 至少 1 条、最多 6 条；不要 markdown，不要代码块包裹 JSON。`;

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userBlob.slice(0, 48000) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM ${res.status}: ${err.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM empty content');

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    return {
      sections: [{ category: '其他', one_line: '模型未返回有效 JSON', bullets: [content.slice(0, 400)] }],
      chart: null,
    };
  }

  const p = parsed as Record<string, unknown>;
  const sectionsRaw = Array.isArray(p.sections) ? p.sections : [];
  const sections = sectionsRaw.map((s) => {
    const r = s as Record<string, unknown>;
    const bullets = Array.isArray(r.bullets) ? r.bullets.map((x) => String(x)) : [];
    return {
      category: String(r.category ?? '其他'),
      one_line: String(r.one_line ?? ''),
      bullets: bullets.slice(0, 5),
    };
  });

  let chart: LlmDigestResult['chart'] = null;
  if (p.chart && typeof p.chart === 'object' && p.chart !== null) {
    const c = p.chart as Record<string, unknown>;
    chart = {
      title: String(c.title ?? '数据'),
      headers: Array.isArray(c.headers) ? c.headers.map((x) => String(x)) : [],
      rows: Array.isArray(c.rows) ? c.rows.map((row) => (Array.isArray(row) ? row.map((x) => String(x)) : [])) : [],
    };
  }

  if (sections.length === 0) {
    return {
      sections: [{ category: '其他', one_line: '暂无结构化摘要', bullets: [] }],
      chart: null,
    };
  }

  return { sections, chart };
}

export function fallbackDigestFromTitles(items: { title: string; url: string }[]): LlmDigestResult {
  return {
    sections: [
      {
        category: '其他',
        one_line: `共收录 ${items.length} 条来源（LLM 未配置或调用失败时的回退列表）`,
        bullets: items.slice(0, 15).map((i) => `${i.title} — ${i.url}`),
      },
    ],
    chart: null,
  };
}
