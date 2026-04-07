/**
 * 资讯日报 Queue 消息（与 producer / consumer 共用）
 */
import { z } from 'zod';

export const digestQueueMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run_digest'),
    runId: z.string().min(1),
    userId: z.string().min(1),
  }),
  z.object({
    type: z.literal('cron_tick'),
    cron: z.string(),
    scheduledTime: z.number(),
  }),
  z.object({
    type: z.literal('run_subscription'),
    runId: z.string().min(1),
    ownerUserId: z.string().min(1),
    subscriptionId: z.string().min(1),
    mode: z.enum(['scheduled', 'test']),
  }),
]);

export type DigestQueueMessage = z.infer<typeof digestQueueMessageSchema>;
