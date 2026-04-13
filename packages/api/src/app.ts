/**
 * Hono 搴旂敤锛堜緵 fetch handler 浣跨敤锛?
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { TYPES_VERSION } from '@hamhome/types';
import type { Env } from './types/env';
import { digest } from './routes/digest';

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin;
    if (origin === 'https://hamhome.app') return origin;
    if (origin === 'http://localhost:3000') return origin;
    if (origin.startsWith('chrome-extension://')) return origin;
    if (origin.endsWith('.pages.dev')) return origin;
    return '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  credentials: true,
}));

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    timestamp: Date.now(),
    environment: c.env.ENVIRONMENT,
    typesVersion: TYPES_VERSION,
  }),
);

app.get('/', (c) =>
  c.json({
    name: 'HamHome API',
    version: '1.0.0',
    message: '馃惞 HamHome API is running!',
    digest: '/v1/digest/*',
  }),
);

app.route('/v1/digest', digest);

app.notFound((c) =>
  c.json(
    {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    },
    404,
  ),
);

app.onError((err, c) => {
  console.error('[@hamhome/api] Error:', err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: c.env.ENVIRONMENT === 'production' ? 'Internal server error' : err.message,
      },
    },
    500,
  );
});

export { app };

