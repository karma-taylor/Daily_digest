/**
 * Cloudflare Queue consumer：run_digest / run_subscription / cron_tick
 */
import { and, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '@hamhome/db/schema';
import { createDb } from '../lib/db';
import { runDigestPipeline, runDigestPipelineForSubscription } from '../lib/pipeline';
import { shouldRunDigestThisHour } from '../lib/timezone';
import { shouldRunSubscriptionAtLocalTime } from '../lib/schedule';
import type { Env } from '../types/env';
import { digestQueueMessageSchema, type DigestQueueMessage } from './messages';

async function processRunDigest(env: Env, runId: string, userId: string): Promise<void> {
  await runDigestPipeline(env, runId, userId);
}

async function processRunSubscription(
  env: Env,
  runId: string,
  ownerUserId: string,
  subscriptionId: string,
  mode: 'scheduled' | 'test',
): Promise<void> {
  await runDigestPipelineForSubscription(env, runId, ownerUserId, subscriptionId, mode);
}

async function processCronTick(env: Env, cron: string, scheduledTime: number): Promise<void> {
  const d1 = env.DB;
  if (!d1) {
    console.warn('[digest-consumer] cron_tick: DB not bound');
    return;
  }
  if (!env.DIGEST_QUEUE) {
    console.warn('[digest-consumer] cron_tick: DIGEST_QUEUE not bound');
    return;
  }

  const db = createDb(d1);

  const settingsRows = await db.select().from(schema.digestUserSettings);
  console.log('[digest-consumer] cron_tick', { cron, scheduledTime, settingsRows: settingsRows.length });

  for (const row of settingsRows) {
    const tz = row.timezone?.trim() || 'Asia/Shanghai';
    if (!shouldRunDigestThisHour(scheduledTime, tz, row.deliverHourLocal ?? 8)) continue;

    const runId = nanoid();
    await db.insert(schema.digestRuns).values({
      id: runId,
      userId: row.userId,
      status: 'pending',
      summaryHtml: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
    });
    await env.DIGEST_QUEUE.send({ type: 'run_digest', runId, userId: row.userId } satisfies DigestQueueMessage);
  }

  const subRows = await db.select().from(schema.digestSubscriptions)
    .where(eq(schema.digestSubscriptions.enabled, true));

  for (const sub of subRows) {
    const tz = sub.timezone?.trim() || 'Asia/Shanghai';
    if (!shouldRunSubscriptionAtLocalTime(scheduledTime, tz, sub.deliverTimeLocal, 10)) continue;

    // 防止同一小时重复发送
    const existing = await db.select().from(schema.digestRuns)
      .where(and(eq(schema.digestRuns.userId, sub.ownerUserId), eq(schema.digestRuns.status, 'done')))
      .orderBy(desc(schema.digestRuns.createdAt))
      .limit(1);
    if (existing[0]) {
      const ts = existing[0].createdAt ? new Date(existing[0].createdAt).getTime() : 0;
      if (Math.abs(ts - scheduledTime) < 55 * 60 * 1000) continue;
    }

    const runId = nanoid();
    await db.insert(schema.digestRuns).values({
      id: runId,
      userId: sub.ownerUserId,
      status: 'pending',
      summaryHtml: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
    });

    await env.DIGEST_QUEUE.send({
      type: 'run_subscription',
      runId,
      ownerUserId: sub.ownerUserId,
      subscriptionId: sub.id,
      mode: 'scheduled',
    } satisfies DigestQueueMessage);
  }
}

export async function handleQueueBatch(
  batch: MessageBatch<unknown>,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  for (const msg of batch.messages) {
    const parsed = digestQueueMessageSchema.safeParse(msg.body);
    if (!parsed.success) {
      console.error('[digest-consumer] invalid message', parsed.error.flatten());
      msg.ack();
      continue;
    }

    const body = parsed.data;
    try {
      if (body.type === 'run_digest') {
        await processRunDigest(env, body.runId, body.userId);
      } else if (body.type === 'run_subscription') {
        await processRunSubscription(env, body.runId, body.ownerUserId, body.subscriptionId, body.mode);
      } else {
        await processCronTick(env, body.cron, body.scheduledTime);
      }
      msg.ack();
    } catch (e) {
      console.error('[digest-consumer] message failed', e);
      msg.retry();
    }
  }
}

