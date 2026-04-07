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


function limitBucketsByTotalItems(
  buckets: { category: string; items: Agg[] }[],
  totalCap: number,
): { category: string; items: Agg[] }[] {
  let remain = Math.max(1, totalCap);
  return buckets.map((b) => {
    if (remain <= 0) return { category: b.category, items: [] };
    const take = Math.min(remain, b.items.length);
    remain -= take;
    return { category: b.category, items: b.items.slice(0, take) };
  });
}
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
 * 瀹屾暣娴佹按绾匡細澶氭簮鎷夊彇 鈫?鍘婚噸/鍏抽敭璇嶆垨澶氫富棰樺垎妗?鈫?LLM 鎽樿 鈫?HTML 鈫?閭欢 / MQTT
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
    let emailSubjectPrefix = 'HamHome 璧勮鏃ユ姤';

    if (useTopics) {
      emailSubjectPrefix = 'HamHome Topic Digest';
      const buckets = partitionItemsIntoTopicBuckets(deduped, topicConfigs);
      const totalMatched = buckets.reduce((n, b) => n + b.items.length, 0);

      if (deduped.length === 0) {
        llmResult = {
          sections: [
            {
              category: '鍏朵粬',
              one_line: '鏈鏈悎骞跺埌鏈夋晥鏉＄洰',
              bullets: sourceErrors.length
                ? [`閮ㄥ垎婧愭姄鍙栧け璐ワ細${sourceErrors.join(' | ')}`]
                : ['Please add enabled RSS or URL sources'],
            },
          ],
          chart: null,
        };
      } else if (totalMatched === 0) {
        llmResult = {
          sections: buckets.map((b) => ({
            category: b.category,
            one_line: '浠婃棩鎶撳彇缁撴灉涓湭鍖归厤鍒拌涓婚锛堝缓璁鍔犲浗闄?绉戞妧绫?RSS 鎴栬皟鏁?topics 鍏抽敭璇嶏級',
            bullets: [],
          })),
          chart: null,
        };
      } else {
        const topicBlocks = buckets.map((b) => ({
          category: b.category,
          blob: b.items
            .map((it, i) => `[${i + 1}] ${it.title}\nURL: ${it.url}\n鎽樺綍: ${it.summary.slice(0, 1200)}\n`)
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
              category: '鍏朵粬',
              one_line: '鏈鏈悎骞跺埌鏈夋晥鏉＄洰',
              bullets: sourceErrors.length
                ? [`閮ㄥ垎婧愭姄鍙栧け璐ワ細${sourceErrors.join(' | ')}`]
                : ['璇锋坊鍔犲惎鐢ㄧ殑 RSS 鎴?URL 鏁版嵁婧愶紝鎴栨斁瀹藉叧閿瘝'],
            },
          ],
          chart: null,
        };
      } else {
        const blob = limited
          .map((it, i) => `[${i + 1}] ${it.title}\nURL: ${it.url}\n鎽樺綍: ${it.summary.slice(0, 1500)}\n`)
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
      const subj = `${emailSubjectPrefix} 路 ${generatedAt.slice(0, 10)}`;
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
        : 'Digest generated';
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
/**
 * 订阅版流水线：按 subscription 的邮箱/主题发送；数据源沿用 ownerUserId 的 digest_sources。
 */
export async function runDigestPipelineForSubscription(
  env: Env,
  runId: string,
  ownerUserId: string,
  subscriptionId: string,
  mode: 'scheduled' | 'test',
): Promise<void> {
  const d1 = env.DB;
  if (!d1) throw new Error('DB not bound');
  const db = createDb(d1);

  const [run] = await db.select().from(schema.digestRuns).where(
    and(eq(schema.digestRuns.id, runId), eq(schema.digestRuns.userId, ownerUserId)),
  ).limit(1);
  if (!run) return;

  await db.update(schema.digestRuns)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(schema.digestRuns.id, runId));

  try {
    const [sub] = await db.select().from(schema.digestSubscriptions).where(
      and(eq(schema.digestSubscriptions.id, subscriptionId), eq(schema.digestSubscriptions.ownerUserId, ownerUserId)),
    ).limit(1);
    if (!sub) throw new Error('subscription not found');

    const topicConfigs = parseTopicsFromSettings(sub.topicsJson);
    if (topicConfigs.length === 0) throw new Error('subscription topics invalid');

    const sources = await db.select().from(schema.digestSources).where(
      and(eq(schema.digestSources.userId, ownerUserId), eq(schema.digestSources.enabled, true)),
    );

    const agg: Agg[] = [];
    const sourceErrors: string[] = [];
    const rssCap = mode === 'test' ? 25 : 70;

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

    const deduped = dedupeByUrlAndTitle(agg);
    const perTopicCap = Math.max(1, Math.min(40, sub.maxItemsPerTopic ?? 10));
    const totalCap = Math.max(1, Math.min(200, sub.maxItemsPerEmail ?? 20));
    const bucketsRaw = partitionItemsIntoTopicBuckets(deduped, topicConfigs.map((t) => ({
      ...t,
      maxItems: mode === 'test' ? Math.min(5, t.maxItems ?? perTopicCap, perTopicCap) : Math.min(t.maxItems ?? perTopicCap, perTopicCap),
    })));
    const buckets = limitBucketsByTotalItems(bucketsRaw, mode === 'test' ? Math.min(totalCap, 8) : totalCap);

    let llmResult: LlmDigestResult;
    const totalMatched = buckets.reduce((n, b) => n + b.items.length, 0);
    if (deduped.length === 0) {
      llmResult = {
        sections: [{ category: '其他', one_line: '本次未合并到有效条目', bullets: sourceErrors.length ? [`部分源抓取失败：${sourceErrors.join(' | ')}`] : ['请添加启用的 RSS 或 URL 数据源'] }],
        chart: null,
      };
    } else if (totalMatched === 0) {
      llmResult = {
        sections: buckets.map((b) => ({ category: b.category, one_line: '今日抓取结果中未匹配到该主题', bullets: [] })),
        chart: null,
      };
    } else {
      const topicBlocks = buckets.map((b) => ({
        category: b.category,
        blob: b.items.map((it, i) => `[${i + 1}] ${it.title}\nURL: ${it.url}\n摘录: ${it.summary.slice(0, 1200)}\n`).join('\n'),
      }));
      const slim = buckets.map((b) => ({ category: b.category, items: b.items.map((x) => ({ title: x.title, url: x.url })) }));
      try {
        const out = await generateTopicDigestWithLlm(env, topicBlocks);
        llmResult = out ?? fallbackDigestFromTopicBuckets(slim);
      } catch {
        llmResult = fallbackDigestFromTopicBuckets(slim);
      }
    }

    const generatedAt = new Date().toISOString();
    const prefix = mode === 'test' ? '[TEST] HamHome 订阅日报' : 'HamHome 订阅日报';
    const summaryHtml = renderDigestEmailHtml(llmResult, { runId, generatedAt, title: prefix });

    const to = sub.email.trim();
    const subj = `${prefix} · ${generatedAt.slice(0, 10)}`;
    const deliveryNotes: string[] = [];
    const mail = await sendHtmlEmail(env, to, subj, summaryHtml);
    if (!mail.ok) {
      deliveryNotes.push(`email_failed: ${mail.error ?? 'unknown'}`);
    }

    const note = sourceErrors.length ? sourceErrors.join('; ') : null;
    const combinedError = [note, ...deliveryNotes].filter(Boolean).join(' | ') || null;

    await db.update(schema.digestRuns)
      .set({ status: 'done', summaryHtml, error: combinedError, finishedAt: new Date() })
      .where(eq(schema.digestRuns.id, runId));
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await db.update(schema.digestRuns)
      .set({ status: 'failed', error: errMsg, finishedAt: new Date() })
      .where(eq(schema.digestRuns.id, runId));
    throw e;
  }
}


