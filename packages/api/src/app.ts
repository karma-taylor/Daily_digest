/**
 * Hono 应用（供 fetch handler 使用）
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
  origin: [
    'https://hamhome.app',
    'chrome-extension://*',
    'http://localhost:3000',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
    message: '🐹 HamHome API is running!',
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
