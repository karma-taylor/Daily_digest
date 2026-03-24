/**
 * Cloudflare Queue consumer：run_digest / cron_tick
 */
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '@hamhome/db/schema';
import { createDb } from '../lib/db';
import { isChinaPublicHoliday } from '../lib/holidays';
import { runDigestPipeline } from '../lib/pipeline';
import { shouldRunDigestThisHour } from '../lib/timezone';
import type { Env } from '../types/env';
import { digestQueueMessageSchema, type DigestQueueMessage } from './messages';

async function processRunDigest(env: Env, runId: string, userId: string): Promise<void> {
  await runDigestPipeline(env, runId, userId);
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
  const rows = await db.select().from(schema.digestUserSettings);

  console.log('[digest-consumer] cron_tick', { cron, scheduledTime, settingsRows: rows.length });

  for (const row of rows) {
    const tz = row.timezone?.trim() || 'Asia/Shanghai';
    if (row.quietOnHolidays && isChinaPublicHoliday(scheduledTime, tz)) {
      continue;
    }
    if (!shouldRunDigestThisHour(scheduledTime, tz, row.deliverHourLocal ?? 8)) {
      continue;
    }

    const runId = nanoid();
    const now = new Date();
    await db.insert(schema.digestRuns).values({
      id: runId,
      userId: row.userId,
      status: 'pending',
      summaryHtml: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
    });
    await env.DIGEST_QUEUE.send({
      type: 'run_digest',
      runId,
      userId: row.userId,
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
