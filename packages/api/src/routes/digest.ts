/**
 * 资讯日报 API — 在现有 HamHome API 上扩展
 * 需配置 D1 绑定名 DB；流水线（抓取/LLM/邮件）由 Cron + Queue 后续接入
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { eq, desc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '@hamhome/db/schema';
import { createDb } from '../lib/db';
import { runDigestPipeline } from '../lib/pipeline';
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

/** 手动触发一次任务占位：后续接 Queue 执行抓取/LLM/邮件 */
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
    /** 本地尽快跑通：无 Queue 时在开发环境同步执行流水线 */
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
        ? '已入队，由 Queue consumer 异步处理。'
        : syncDev
          ? '开发模式：未绑定 Queue，已同步跑完流水线（见 GET /v1/digest/runs）。'
          : '已创建任务但未绑定 DIGEST_QUEUE，且非 development，无法执行；请配置队列或将 ENVIRONMENT 设为 development。',
    },
  }, syncDev ? 200 : 202);
});

export { digest };
