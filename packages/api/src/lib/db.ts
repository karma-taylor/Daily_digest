/**
 * D1 + Drizzle（启用 wrangler.toml 中 DB 绑定后可用）
 */
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@hamhome/db/schema';

export type HamDb = ReturnType<typeof createDb>;

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}
