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


const MAX_TOPIC_BULLETS = 15;

function parseLlmSections(parsed: unknown, maxBullets: number): LlmDigestResult['sections'] {
  const p = parsed as Record<string, unknown>;
  const sectionsRaw = Array.isArray(p.sections) ? p.sections : [];
  return sectionsRaw.map((s) => {
    const r = s as Record<string, unknown>;
    const bullets = Array.isArray(r.bullets) ? r.bullets.map((x) => String(x)) : [];
    return {
      category: String(r.category ?? "其他"),
      one_line: String(r.one_line ?? ""),
      bullets: bullets.slice(0, maxBullets),
    };
  });
}

export async function generateTopicDigestWithLlm(env: Env, topicBlocks: { category: string; blob: string }[]): Promise<LlmDigestResult | null> {
  const base = env.LLM_API_BASE?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
  const key = env.LLM_API_KEY;
  const model = env.LLM_MODEL ?? "gpt-4o-mini";
  if (!key) return null;

  const names = topicBlocks.map((t) => t.category).join("、");
  const n = topicBlocks.length;
  const system =
    "你是专业新闻编辑。用户会按主题提供多段摘录。你必须且仅输出一个 JSON 对象：\n" +
    "{\n" +
    "  \"sections\": [\n" +
    "    { \"category\": \"<必须与输入主题名称完全一致>\", \"one_line\": \"该主题一句话综述\", \"bullets\": [\"要点1\",\"要点2\"] }\n" +
    "  ],\n" +
    "  \"chart\": null\n" +
    "}\n" +
    "硬性要求：\n" +
    "- sections 必须恰好 " +
    n +
    " 条，顺序与主题一致：" +
    names +
    "\n" +
    "- 每个 section 的 bullets 0–" +
    MAX_TOPIC_BULLETS +
    " 条\n" +
    "- 每条 bullet 用中文 1–2 句客观摘要，不编造事实\n" +
    "- 输入已限制为「订阅时区当地日历日=当日」的稿件；不得把明显早于当日的旧闻当今日要闻写\n" +
    "- 不要 markdown，不要代码块包裹 JSON";

  const user = topicBlocks
    .map((t, i) => "## 主题 " + (i + 1) + "：" + t.category + "\n" + t.blob)
    .join("\n\n---\n\n");

  const res = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 6144,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user.slice(0, 56000) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("LLM " + res.status + ": " + err.slice(0, 500));
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM empty content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(content));
  } catch {
    return {
      sections: [{ category: "其他", one_line: "模型未返回有效 JSON", bullets: [content.slice(0, 400)] }],
      chart: null,
    };
  }

  const sections = parseLlmSections(parsed, MAX_TOPIC_BULLETS);
  if (sections.length === 0) {
    return {
      sections: [{ category: "其他", one_line: "暂无结构化摘要", bullets: [] }],
      chart: null,
    };
  }
  return { sections, chart: null };
}

export function fallbackDigestFromTopicBuckets(buckets: { category: string; items: { title: string; url: string }[] }[]) {
  return {
    sections: buckets.map((b) => ({
      category: b.category,
      one_line:
        b.items.length === 0
          ? "本主题今日无匹配条目（可调整关键词或增加 RSS）"
          : "共 " + b.items.length + " 条（LLM 未配置或失败时列表）",
      bullets: b.items.slice(0, MAX_TOPIC_BULLETS).map((i) => i.title + " — " + i.url),
    })),
    chart: null,
  };
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
要求：去重相近信息；客观中性；输入已按用户时区过滤为「当地当日」发布的条目，不得把早于当日的旧闻当今日要点；sections 至少 1 条、最多 6 条；不要 markdown，不要代码块包裹 JSON。`;

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
    const sections = parseLlmSections(parsed, 5);

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
