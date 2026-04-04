import { eq, and } from 'drizzle-orm';
import * as schema from '@hamhome/db/schema';
import { createDb } from './db';
import type { Env } from '../types/env';
import { fetchAndParseFeed } from './rss';
import { fetchPagePlain } from './url-fetch';
import { dedupeByUrlAndTitle } from './dedup';
import {
  generateDigestWithLlm,
  generateTopicDigestWithLlm,
  fallbackDigestFromTitles,
  fallbackDigestFromTopicBuckets,
} from './llm';
import type { LlmDigestResult } from './llm';
import { renderDigestEmailHtml } from './render-digest-html';
import { sendHtmlEmail } from './email';
import { publishDigestMqtt } from './mqtt';
import type { TopicBucketConfig } from './topic-buckets';
import { partitionItemsIntoTopicBuckets } from './topic-buckets';

type Agg = { title: string; url: string; summary: string };

function parseTopicsFromSettings(rawJson: string | null | undefined): TopicBucketConfig[] {
  if (!rawJson?.trim()) return [];
  try {
    const raw = JSON.parse(rawJson) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(Boolean)
      .map((t) => {
        const o = t as Record<string, unknown>;
        const label = String(o.label ?? '').trim();
        const keywords = Array.isArray(o.keywords) ? o.keywords.map((x) => String(x)) : [];
        const maxItems = typeof o.maxItems === 'number' ? o.maxItems : undefined;
        return { label, keywords, maxItems };
      })
      .filter((t) => t.label.length > 0 && t.keywords.length > 0);
  } catch {
    return [];
  }
}

/**
 * 完整流水线：多源拉取 → 去重/关键词或多主题分桶 → LLM 摘要 → HTML → 邮件 / MQTT
 */
export async function runDigestPipeline(env: Env, runId: string, userId: string): Promise<void> {
  const d1 = env.DB;
  if (!d1) throw new Error('DB not bound');
  const db = createDb(d1);

  const [run] = await db.select().from(schema.digestRuns).where(
    and(eq(schema.digestRuns.id, runId), eq(schema.digestRuns.userId, userId)),
  ).limit(1);

  if (!run) {
    console.warn('[pipeline] run not found', { runId, userId });
    return;
  }
  if (run.status === 'done') return;

  await db.update(schema.digestRuns)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(schema.digestRuns.id, runId));

  try {
    const sources = await db.select().from(schema.digestSources).where(
      and(eq(schema.digestSources.userId, userId), eq(schema.digestSources.enabled, true)),
    );
    const [settings] = await db.select().from(schema.digestUserSettings).where(
      eq(schema.digestUserSettings.userId, userId),
    ).limit(1);

    let keywords: string[] = [];
    if (settings?.keywordsJson) {
      try {
        keywords = JSON.parse(settings.keywordsJson) as string[];
      } catch {
        keywords = [];
      }
    }

    const topicConfigs = parseTopicsFromSettings(settings?.topicsJson);
    const useTopics = topicConfigs.length > 0;

    const agg: Agg[] = [];
    const sourceErrors: string[] = [];

    const rssCap = useTopics ? 70 : 25;

    for (const src of sources) {
      try {
        if (src.kind === 'rss') {
          const items = await fetchAndParseFeed(src.url);
          for (const it of items.slice(0, rssCap)) {
            agg.push({ title: it.title, url: it.url, summary: it.summary || '' });
          }
        } else {
          const page = await fetchPagePlain(src.url);
          agg.push({ title: page.title, url: src.url, summary: page.text.slice(0, 6000) });
        }
      } catch (e) {
        sourceErrors.push(`${src.url}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    let deduped = dedupeByUrlAndTitle(agg);
    if (!useTopics && keywords.length > 0) {
      const kw = keywords.map((k) => k.toLowerCase());
      deduped = deduped.filter((it) => {
        const blob = `${it.title} ${it.summary}`.toLowerCase();
        return kw.some((k) => blob.includes(k));
      });
    }

    let llmResult: LlmDigestResult;
    let emailSubjectPrefix = 'HamHome 资讯日报';

    if (useTopics) {
      emailSubjectPrefix = 'HamHome 双主题日报';
      const buckets = partitionItemsIntoTopicBuckets(deduped, topicConfigs);
      const totalMatched = buckets.reduce((n, b) => n + b.items.length, 0);

      if (deduped.length === 0) {
        llmResult = {
          sections: [
            {
              category: '其他',
              one_line: '本次未合并到有效条目',
              bullets: sourceErrors.length
                ? [`部分源抓取失败：${sourceErrors.join(' | ')}`]
                : ['请添加启用的 RSS 或 URL 数据源'],
            },
          ],
          chart: null,
        };
      } else if (totalMatched === 0) {
        llmResult = {
          sections: buckets.map((b) => ({
            category: b.category,
            one_line: '今日抓取结果中未匹配到该主题（建议增加国际/科技类 RSS 或调整 topics 关键词）',
            bullets: [],
          })),
          chart: null,
        };
      } else {
        const topicBlocks = buckets.map((b) => ({
          category: b.category,
          blob: b.items
            .map((it, i) => `[${i + 1}] ${it.title}\nURL: ${it.url}\n摘录: ${it.summary.slice(0, 1200)}\n`)
            .join('\n'),
        }));
        const slim = buckets.map((b) => ({
          category: b.category,
          items: b.items.map((x) => ({ title: x.title, url: x.url })),
        }));
        try {
          const out = await generateTopicDigestWithLlm(env, topicBlocks);
          llmResult = out ?? fallbackDigestFromTopicBuckets(slim);
        } catch (e) {
          console.warn('[pipeline] topic LLM error, fallback', e);
          llmResult = fallbackDigestFromTopicBuckets(slim);
        }
      }
    } else {
      const limited = deduped.slice(0, 45);

      if (limited.length === 0) {
        llmResult = {
          sections: [
            {
              category: '其他',
              one_line: '本次未合并到有效条目',
              bullets: sourceErrors.length
                ? [`部分源抓取失败：${sourceErrors.join(' | ')}`]
                : ['请添加启用的 RSS 或 URL 数据源，或放宽关键词'],
            },
          ],
          chart: null,
        };
      } else {
        const blob = limited
          .map((it, i) => `[${i + 1}] ${it.title}\nURL: ${it.url}\n摘录: ${it.summary.slice(0, 1500)}\n`)
          .join('\n');

        try {
          const out = await generateDigestWithLlm(env, blob);
          llmResult = out ?? fallbackDigestFromTitles(limited);
        } catch (e) {
          console.warn('[pipeline] LLM error, fallback', e);
          llmResult = fallbackDigestFromTitles(limited);
        }
      }
    }

    const generatedAt = new Date().toISOString();
    const summaryHtml = renderDigestEmailHtml(llmResult, { runId, generatedAt, title: emailSubjectPrefix });

    const note = sourceErrors.length ? sourceErrors.join('; ') : null;
    const deliveryNotes: string[] = [];

    const email = settings?.deliveryEmail?.trim();
    if (email) {
      const subj = `${emailSubjectPrefix} · ${generatedAt.slice(0, 10)}`;
      const mail = await sendHtmlEmail(env, email, subj, summaryHtml);
      if (!mail.ok) {
        console.warn('[pipeline] email', mail.error);
        deliveryNotes.push(`email_failed: ${mail.error ?? 'unknown'}`);
      }
    }

    const mqttSuffix = settings?.mqttTopicSuffix?.trim();
    if (mqttSuffix && env.MQTT_NOTIFY_URL) {
      const topic = `hamhome/digest/${userId}/${mqttSuffix}`;
      const voice = llmResult.sections[0]
        ? `${llmResult.sections[0].one_line} ${llmResult.sections[0].bullets.slice(0, 3).join('；')}`
        : '今日摘要已生成';
      const payload = JSON.stringify({
        runId,
        userId,
        text: voice.slice(0, 1200),
        at: generatedAt,
      });
      const mq = await publishDigestMqtt(env, topic, payload);
      if (!mq.ok) {
        console.warn('[pipeline] mqtt', mq.error);
        deliveryNotes.push(`mqtt_failed: ${mq.error ?? 'unknown'}`);
      }
    }

    const combinedError = [note, ...deliveryNotes].filter(Boolean).join(' | ') || null;

    await db.update(schema.digestRuns)
      .set({
        status: 'done',
        summaryHtml,
        error: combinedError,
        finishedAt: new Date(),
      })
      .where(eq(schema.digestRuns.id, runId));
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await db.update(schema.digestRuns)
      .set({
        status: 'failed',
        error: errMsg,
        finishedAt: new Date(),
      })
      .where(eq(schema.digestRuns.id, runId));
    throw e;
  }
}