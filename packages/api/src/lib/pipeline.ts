import { eq, and } from 'drizzle-orm';
import * as schema from '@hamhome/db/schema';
import { createDb } from './db';
import type { Env } from '../types/env';
import { fetchAndParseFeed } from './rss';
import { fetchPagePlain } from './url-fetch';
import { dedupeByUrlAndTitle } from './dedup';
import { generateDigestWithLlm, fallbackDigestFromTitles } from './llm';
import type { LlmDigestResult } from './llm';
import { renderDigestEmailHtml } from './render-digest-html';
import { sendHtmlEmail } from './email';
import { publishDigestMqtt } from './mqtt';

type Agg = { title: string; url: string; summary: string };

/**
 * 完整流水线：多源拉取 → 去重/关键词过滤 → LLM 摘要与分类 → HTML → 邮件 / MQTT
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

    const agg: Agg[] = [];
    const sourceErrors: string[] = [];

    for (const src of sources) {
      try {
        if (src.kind === 'rss') {
          const items = await fetchAndParseFeed(src.url);
          for (const it of items.slice(0, 25)) {
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
    if (keywords.length > 0) {
      const kw = keywords.map((k) => k.toLowerCase());
      deduped = deduped.filter((it) => {
        const blob = `${it.title} ${it.summary}`.toLowerCase();
        return kw.some((k) => blob.includes(k));
      });
    }

    const limited = deduped.slice(0, 45);

    let llmResult: LlmDigestResult;
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

    const generatedAt = new Date().toISOString();
    const summaryHtml = renderDigestEmailHtml(llmResult, { runId, generatedAt });

    const note = sourceErrors.length ? sourceErrors.join('; ') : null;
    const deliveryNotes: string[] = [];

    const email = settings?.deliveryEmail?.trim();
    if (email) {
      const subj = `HamHome 资讯日报 · ${generatedAt.slice(0, 10)}`;
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
