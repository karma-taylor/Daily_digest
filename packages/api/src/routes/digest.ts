/**
 * 鐠у嫯顔嗛弮銉﹀Г API 閳?閸︺劎骞囬張?HamHome API 娑撳﹥澧跨仦? * 闂団偓闁板秶鐤?D1 缂佹垵鐣鹃崥?DB閿涙稒绁﹀瀵稿殠閿涘牊濮勯崣?LLM/闁喕娆㈤敍澶屾暠 Cron + Queue 閸氬海鐢婚幒銉ュ弳
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '@hamhome/db/schema';
import { createDb } from '../lib/db';
import { runDigestPipeline, runDigestPipelineForSubscription } from '../lib/pipeline';
import type { DigestQueueMessage } from '../queue/messages';
import type { Env } from '../types/env';

const digest = new Hono<{ Bindings: Env }>();

function requireUserId(c: { req: { header: (n: string) => string | undefined } }) {
  const id = c.req.header('x-user-id')?.trim();
  if (!id) return null;
  return id;
}

function requireDb(c: { env: Env }) {
  const db = c.env.DB;
  if (!db) return null;
  return createDb(db);
}
function requireAdminToken(c: { req: { header: (n: string) => string | undefined }; env: Env }) {
  const expected = c.env.DIGEST_ADMIN_TOKEN?.trim();
  if (!expected) return { ok: false as const, code: 503 as const, message: 'DIGEST_ADMIN_TOKEN not configured' };
  const auth = c.req.header('authorization')?.trim() ?? '';
  const mm = /^Bearer\s+(.+)$/i.exec(auth);
  const got = mm?.[1]?.trim() ?? '';
  if (!got || got !== expected) return { ok: false as const, code: 401 as const, message: 'Unauthorized' };
  return { ok: true as const };
}

function requireAdminOwnerUserId(env: Env): string {
  return (env.DIGEST_ADMIN_OWNER_USER_ID?.trim() || 'dev-user-1');
}


digest.get('/sources', async (c) => {
  const userId = requireUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing X-User-Id' } }, 401);
  }
  const db = requireDb(c);
  if (!db) {
    return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);
  }
  const rows = await db.select().from(schema.digestSources).where(eq(schema.digestSources.userId, userId));
  return c.json({ success: true, data: rows });
});

const createSourceSchema = z.object({
  kind: z.enum(['rss', 'url']),
  url: z.string().url(),
  title: z.string().optional(),
});

digest.post('/sources', zValidator('json', createSourceSchema), async (c) => {
  const userId = requireUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing X-User-Id' } }, 401);
  }
  const db = requireDb(c);
  if (!db) {
    return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);
  }
  const body = c.req.valid('json');
  const id = nanoid();
  const now = new Date();
  try {
    await db.insert(schema.digestSources).values({
      id,
      userId,
      kind: body.kind,
      url: body.url,
      title: body.title ?? null,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'insert failed';
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: msg } }, 400);
  }
  const [row] = await db.select().from(schema.digestSources).where(eq(schema.digestSources.id, id));
  return c.json({ success: true, data: row }, 201);
});

digest.delete('/sources/:id', async (c) => {
  const userId = requireUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing X-User-Id' } }, 401);
  }
  const db = requireDb(c);
  if (!db) {
    return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);
  }
  const id = c.req.param('id');
  const found = await db.select().from(schema.digestSources).where(
    and(eq(schema.digestSources.id, id), eq(schema.digestSources.userId, userId)),
  ).limit(1);
  if (!found.length) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Source not found' } }, 404);
  }
  await db.delete(schema.digestSources).where(
    and(eq(schema.digestSources.id, id), eq(schema.digestSources.userId, userId)),
  );
  return c.json({ success: true, data: { id } });
});


const topicConfigSchema = z.object({
  label: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  maxItems: z.number().min(1).max(40).optional(),
});

const deliverTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const createSubscriptionSchema = z.object({
  email: z.string().email(),
  timezone: z.string().min(1),
  deliverTimeLocal: z.string().regex(deliverTimeRegex),
  topics: z.array(topicConfigSchema).min(1),
  enabled: z.boolean().optional(),
  maxItemsPerEmail: z.number().int().min(1).max(200).optional(),
  maxItemsPerTopic: z.number().int().min(1).max(40).optional(),
});

const updateSubscriptionSchema = z.object({
  email: z.string().email().optional(),
  timezone: z.string().min(1).optional(),
  deliverTimeLocal: z.string().regex(deliverTimeRegex).optional(),
  topics: z.array(topicConfigSchema).min(1).optional(),
  enabled: z.boolean().optional(),
  maxItemsPerEmail: z.number().int().min(1).max(200).optional(),
  maxItemsPerTopic: z.number().int().min(1).max(40).optional(),
});

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseTopicsJson(raw: string | null | undefined): { label: string; keywords: string[]; maxItems?: number }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => {
      const o = x as Record<string, unknown>;
      return {
        label: String(o.label ?? ''),
        keywords: Array.isArray(o.keywords) ? o.keywords.map((k) => String(k)) : [],
        maxItems: typeof o.maxItems === 'number' ? o.maxItems : undefined,
      };
    }).filter((x) => x.label && x.keywords.length > 0);
  } catch {
    return [];
  }
}
const settingsSchema = z.object({
  timezone: z.string().optional(),
  deliveryEmail: z.string().email().optional().nullable(),
  keywords: z.array(z.string()).optional(),
  deliverHourLocal: z.number().min(0).max(23).optional(),
  quietOnHolidays: z.boolean().optional(),
  mqttTopicSuffix: z.string().optional().nullable(),
  topics: z
    .array(
      z.object({
        label: z.string().min(1),
        keywords: z.array(z.string()).min(1),
        maxItems: z.number().min(1).max(40).optional(),
      }),
    )
    .optional(),
});

digest.get('/settings', async (c) => {
  const userId = requireUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing X-User-Id' } }, 401);
  }
  const db = requireDb(c);
  if (!db) {
    return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);
  }
  const [row] = await db.select().from(schema.digestUserSettings).where(eq(schema.digestUserSettings.userId, userId));
  if (!row) {
    return c.json({
      success: true,
      data: null,
    });
  }
  let keywords: string[] = [];
  if (row.keywordsJson) {
    try {
      keywords = JSON.parse(row.keywordsJson) as string[];
    } catch {
      keywords = [];
    }
  }
  let topics: { label: string; keywords: string[]; maxItems?: number }[] = [];
  if (row.topicsJson) {
    try {
      const t = JSON.parse(row.topicsJson) as unknown;
      if (Array.isArray(t)) {
        topics = t
          .filter(Boolean)
          .map((x) => {
            const o = x as Record<string, unknown>;
            return {
              label: String(o.label ?? ""),
              keywords: Array.isArray(o.keywords) ? o.keywords.map((k) => String(k)) : [],
              maxItems: typeof o.maxItems === "number" ? o.maxItems : undefined,
            };
          })
          .filter((x) => x.label.length > 0 && x.keywords.length > 0);
      }
    } catch {
      topics = [];
    }
  }
  return c.json({
    success: true,
    data: {
      userId: row.userId,
      timezone: row.timezone,
      deliveryEmail: row.deliveryEmail,
      keywords,
      topics,
      deliverHourLocal: row.deliverHourLocal ?? 8,
      quietOnHolidays: row.quietOnHolidays ?? false,
      mqttTopicSuffix: row.mqttTopicSuffix,
      updatedAt: row.updatedAt,
    },
  });
});

digest.put('/settings', zValidator('json', settingsSchema), async (c) => {
  const userId = requireUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing X-User-Id' } }, 401);
  }
  const db = requireDb(c);
  if (!db) {
    return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);
  }
  const body = c.req.valid('json');
  const now = new Date();
  const keywordsJson = body.keywords !== undefined ? JSON.stringify(body.keywords) : undefined;
  const topicsJson = body.topics !== undefined ? JSON.stringify(body.topics) : undefined;

  const existing = await db.select().from(schema.digestUserSettings).where(eq(schema.digestUserSettings.userId, userId));
  if (existing.length === 0) {
    await db.insert(schema.digestUserSettings).values({
      userId,
      timezone: body.timezone ?? 'Asia/Shanghai',
      deliveryEmail: body.deliveryEmail ?? null,
      keywordsJson: keywordsJson ?? null,
      topicsJson: topicsJson ?? null,
      deliverHourLocal: body.deliverHourLocal ?? 8,
      quietOnHolidays: body.quietOnHolidays ?? false,
      mqttTopicSuffix: body.mqttTopicSuffix ?? null,
      updatedAt: now,
    });
  } else {
    await db.update(schema.digestUserSettings)
      .set({
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.deliveryEmail !== undefined ? { deliveryEmail: body.deliveryEmail } : {}),
        ...(keywordsJson !== undefined ? { keywordsJson } : {}),
        ...(topicsJson !== undefined ? { topicsJson } : {}),
        ...(body.deliverHourLocal !== undefined ? { deliverHourLocal: body.deliverHourLocal } : {}),
        ...(body.quietOnHolidays !== undefined ? { quietOnHolidays: body.quietOnHolidays } : {}),
        ...(body.mqttTopicSuffix !== undefined ? { mqttTopicSuffix: body.mqttTopicSuffix } : {}),
        updatedAt: now,
      })
      .where(eq(schema.digestUserSettings.userId, userId));
  }

  const [row] = await db.select().from(schema.digestUserSettings).where(eq(schema.digestUserSettings.userId, userId));
  let keywords: string[] = [];
  if (row?.keywordsJson) {
    try {
      keywords = JSON.parse(row.keywordsJson) as string[];
    } catch {
      keywords = [];
    }
  }
  let topics: { label: string; keywords: string[]; maxItems?: number }[] = [];
  if (row?.topicsJson) {
    try {
      const t = JSON.parse(row.topicsJson) as unknown;
      if (Array.isArray(t)) {
        topics = t
          .filter(Boolean)
          .map((x) => {
            const o = x as Record<string, unknown>;
            return {
              label: String(o.label ?? ""),
              keywords: Array.isArray(o.keywords) ? o.keywords.map((k) => String(k)) : [],
              maxItems: typeof o.maxItems === "number" ? o.maxItems : undefined,
            };
          })
          .filter((x) => x.label.length > 0 && x.keywords.length > 0);
      }
    } catch {
      topics = [];
    }
  }
  return c.json({
    success: true,
    data: row
      ? {
          userId: row.userId,
          timezone: row.timezone,
          deliveryEmail: row.deliveryEmail,
          keywords,
          topics,
          deliverHourLocal: row.deliverHourLocal ?? 8,
          quietOnHolidays: row.quietOnHolidays ?? false,
          mqttTopicSuffix: row.mqttTopicSuffix,
          updatedAt: row.updatedAt,
        }
      : null,
  });
});

digest.get('/runs', async (c) => {
  const userId = requireUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing X-User-Id' } }, 401);
  }
  const db = requireDb(c);
  if (!db) {
    return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);
  }
  const rows = await db.select().from(schema.digestRuns)
    .where(eq(schema.digestRuns.userId, userId))
    .orderBy(desc(schema.digestRuns.createdAt))
    .limit(50);
  return c.json({ success: true, data: rows });
});

/** 閹靛濮╃憴锕€褰傛稉鈧▎鈥叉崲閸斺€冲窗娴ｅ稄绱伴崥搴ｇ敾閹?Queue 閹笛嗩攽閹舵挸褰?LLM/闁喕娆?*/
digest.post('/runs', async (c) => {
  const userId = requireUserId(c);
  if (!userId) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing X-User-Id' } }, 401);
  }
  const db = requireDb(c);
  if (!db) {
    return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);
  }
  const id = nanoid();
  const now = new Date();
  await db.insert(schema.digestRuns).values({
    id,
    userId,
    status: 'pending',
    summaryHtml: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now,
  });

  const q = c.env.DIGEST_QUEUE;
  let queued = false;
  let syncDev = false;
  if (q) {
    const msg: DigestQueueMessage = { type: 'run_digest', runId: id, userId };
    await q.send(msg);
    queued = true;
  } else if (c.env.ENVIRONMENT === 'development') {
    /** 閺堫剙婀寸亸钘夋彥鐠烘垿鈧熬绱伴弮?Queue 閺冭泛婀鈧崣鎴犲箚婢у啫鎮撳銉﹀⒔鐞涘本绁﹀瀵稿殠 */
    await runDigestPipeline(c.env, id, userId);
    syncDev = true;
  }

  return c.json({
    success: true,
    data: {
      id,
      queued,
      syncDev,
      message: queued
        ? 'Queued for async processing by DIGEST_QUEUE.'
        : syncDev
          ? 'Development mode: processed synchronously (see GET /v1/digest/runs).'
          : 'Run created but cannot execute without DIGEST_QUEUE (or development mode).',
    },
  }, syncDev ? 200 : 202);
});


digest.get('/subscriptions', async (c) => {  const admin = requireAdminToken(c);  if (!admin.ok) return c.json({ success: false, error: { code: admin.code === 401 ? 'UNAUTHORIZED' : 'NOT_CONFIGURED', message: admin.message } }, admin.code);  const userId = requireAdminOwnerUserId(c.env);
  const db = requireDb(c);
  if (!db) return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);

  const rows = await db.select().from(schema.digestSubscriptions)
    .where(eq(schema.digestSubscriptions.ownerUserId, userId))
    .orderBy(desc(schema.digestSubscriptions.updatedAt));

  return c.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      ownerUserId: r.ownerUserId,
      email: r.email,
      timezone: r.timezone,
      deliverTimeLocal: r.deliverTimeLocal,
      topics: parseTopicsJson(r.topicsJson),
      enabled: r.enabled ?? false,
      maxItemsPerEmail: r.maxItemsPerEmail,
      maxItemsPerTopic: r.maxItemsPerTopic,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
});

digest.post('/subscriptions', zValidator('json', createSubscriptionSchema), async (c) => {  const admin = requireAdminToken(c);  if (!admin.ok) return c.json({ success: false, error: { code: admin.code === 401 ? 'UNAUTHORIZED' : 'NOT_CONFIGURED', message: admin.message } }, admin.code);  const userId = requireAdminOwnerUserId(c.env);
  const db = requireDb(c);
  if (!db) return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);

  const body = c.req.valid('json');
  if (!isValidTimeZone(body.timezone)) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid timezone' } }, 400);
  }

  const id = nanoid();
  const now = new Date();
  await db.insert(schema.digestSubscriptions).values({
    id,
    ownerUserId: userId,
    email: body.email,
    timezone: body.timezone,
    deliverTimeLocal: body.deliverTimeLocal,
    topicsJson: JSON.stringify(body.topics),
    enabled: body.enabled ?? false,
    maxItemsPerEmail: body.maxItemsPerEmail ?? 50,
    maxItemsPerTopic: body.maxItemsPerTopic ?? 15,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db.select().from(schema.digestSubscriptions).where(eq(schema.digestSubscriptions.id, id));
  return c.json({ success: true, data: row ? {
    ...row,
    topics: parseTopicsJson(row.topicsJson),
    maxItemsPerEmail: row.maxItemsPerEmail,
    maxItemsPerTopic: row.maxItemsPerTopic,
  } : null }, 201);
});

digest.patch('/subscriptions/:id', zValidator('json', updateSubscriptionSchema), async (c) => {  const admin = requireAdminToken(c);  if (!admin.ok) return c.json({ success: false, error: { code: admin.code === 401 ? 'UNAUTHORIZED' : 'NOT_CONFIGURED', message: admin.message } }, admin.code);  const userId = requireAdminOwnerUserId(c.env);
  const db = requireDb(c);
  if (!db) return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);

  const id = c.req.param('id');
  const body = c.req.valid('json');

  const [found] = await db.select().from(schema.digestSubscriptions).where(
    and(eq(schema.digestSubscriptions.id, id), eq(schema.digestSubscriptions.ownerUserId, userId)),
  ).limit(1);
  if (!found) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Subscription not found' } }, 404);
  if (body.timezone && !isValidTimeZone(body.timezone)) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid timezone' } }, 400);
  }

  await db.update(schema.digestSubscriptions).set({
    ...(body.email !== undefined ? { email: body.email } : {}),
    ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
    ...(body.deliverTimeLocal !== undefined ? { deliverTimeLocal: body.deliverTimeLocal } : {}),
    ...(body.topics !== undefined ? { topicsJson: JSON.stringify(body.topics) } : {}),
    ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    ...(body.maxItemsPerEmail !== undefined ? { maxItemsPerEmail: body.maxItemsPerEmail } : {}),
    ...(body.maxItemsPerTopic !== undefined ? { maxItemsPerTopic: body.maxItemsPerTopic } : {}),
    updatedAt: new Date(),
  }).where(and(eq(schema.digestSubscriptions.id, id), eq(schema.digestSubscriptions.ownerUserId, userId)));

  const [row] = await db.select().from(schema.digestSubscriptions).where(eq(schema.digestSubscriptions.id, id));
  return c.json({ success: true, data: row ? {
    ...row,
    topics: parseTopicsJson(row.topicsJson),
    maxItemsPerEmail: row.maxItemsPerEmail,
    maxItemsPerTopic: row.maxItemsPerTopic,
  } : null });
});

digest.delete('/subscriptions/:id', async (c) => {  const admin = requireAdminToken(c);  if (!admin.ok) return c.json({ success: false, error: { code: admin.code === 401 ? 'UNAUTHORIZED' : 'NOT_CONFIGURED', message: admin.message } }, admin.code);  const userId = requireAdminOwnerUserId(c.env);
  const db = requireDb(c);
  if (!db) return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);

  const id = c.req.param('id');
  await db.delete(schema.digestSubscriptions)
    .where(and(eq(schema.digestSubscriptions.id, id), eq(schema.digestSubscriptions.ownerUserId, userId)));
  return c.json({ success: true, data: { id } });
});

digest.post('/subscriptions/:id/test', async (c) => {  const admin = requireAdminToken(c);  if (!admin.ok) return c.json({ success: false, error: { code: admin.code === 401 ? 'UNAUTHORIZED' : 'NOT_CONFIGURED', message: admin.message } }, admin.code);  const userId = requireAdminOwnerUserId(c.env);
  const db = requireDb(c);
  if (!db) return c.json({ success: false, error: { code: 'DB_NOT_CONFIGURED', message: 'D1 binding DB is not configured' } }, 503);

  const id = c.req.param('id');
  const [sub] = await db.select().from(schema.digestSubscriptions).where(
    and(eq(schema.digestSubscriptions.id, id), eq(schema.digestSubscriptions.ownerUserId, userId)),
  ).limit(1);
  if (!sub) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Subscription not found' } }, 404);

  const runId = nanoid();
  await db.insert(schema.digestRuns).values({
    id: runId,
    userId,
    status: 'pending',
    summaryHtml: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date(),
  });

  const q = c.env.DIGEST_QUEUE;
  let queued = false;
  let syncDev = false;
  if (q) {
    await q.send({
      type: 'run_subscription',
      runId,
      ownerUserId: userId,
      subscriptionId: id,
      mode: 'test',
    } satisfies DigestQueueMessage);
    queued = true;
  } else if (c.env.ENVIRONMENT === 'development') {
    await runDigestPipelineForSubscription(c.env, runId, userId, id, 'test');
    syncDev = true;
  }

  return c.json({
    success: true,
    data: {
      runId,
      queued,
      syncDev,
      message: queued ? 'Test email queued.' : (syncDev ? 'Test email sent in development sync mode.' : 'Queue not bound, cannot send test email asynchronously.'),
    },
  }, syncDev ? 200 : 202);
});
export { digest };










