/**
 * HamHome API - Cloudflare Workers + Hono
 * 默认导出：fetch + queue + scheduled
 */
import type { Env } from './types/env';
import { app } from './app';
import { handleQueueBatch } from './queue/digest-consumer';
import type { DigestQueueMessage } from './queue/messages';

const worker = {
  fetch: app.fetch.bind(app),

  queue: handleQueueBatch,

  /**
   * wrangler.toml 中配置 [triggers] crons 后触发。
   * 向 DIGEST_QUEUE 投递 cron_tick，由 consumer 为每位有 digest_settings 的用户创建 run 并入队。
   */
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('[@hamhome/api] scheduled', event.cron, env.ENVIRONMENT);
    if (!env.DIGEST_QUEUE) {
      console.warn('[@hamhome/api] DIGEST_QUEUE not bound; skip cron enqueue');
      return;
    }
    const msg: DigestQueueMessage = {
      type: 'cron_tick',
      cron: event.cron,
      scheduledTime: event.scheduledTime,
    };
    await env.DIGEST_QUEUE.send(msg);
  },
};

export default worker;
