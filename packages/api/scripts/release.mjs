/**
 * 一键：D1 订阅相关迁移 -> wrangler deploy -> /health 检查
 * 自定义 Worker 地址：HAMHOME_API_URL=https://你的worker.workers.dev
 */
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, '..');

const base = (process.env.HAMHOME_API_URL ?? 'https://hamhome-api.hamhome-680ce447.workers.dev').replace(
  /\/$/,
  '',
);

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', cwd: apiRoot, shell: true });
}

run('pnpm run d1:migrate:0003');
try {
  run('pnpm run d1:migrate:0004');
} catch {
  console.warn('[release] d1:migrate:0004 failed (likely already applied), continue...');
}
run('pnpm run deploy:prod');

const url = `${base}/health`;
const res = await fetch(url);
const text = await res.text();
if (!res.ok) {
  console.error(`Health check failed (${res.status}): ${text}`);
  process.exit(1);
}
try {
  console.log('Health OK:', JSON.parse(text));
} catch {
  console.log('Health OK (raw):', text);
}
