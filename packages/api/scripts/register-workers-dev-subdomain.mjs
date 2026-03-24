/**
 * 为当前 Cloudflare 账号注册 workers.dev 子域（解决 wrangler deploy 非交互卡住）。
 * 从本机 Wrangler 配置读取 OAuth token，不通过命令行传密钥。
 *
 * 用法（在 packages/api 目录）: node scripts/register-workers-dev-subdomain.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const accountId = process.env.CF_ACCOUNT_ID || 'f894a8b6810af6c0ce65d763ec8fd960';
const configPath = path.join(
  process.env.APPDATA || '',
  'xdg.config',
  '.wrangler',
  'config',
  'default.toml',
);

if (!fs.existsSync(configPath)) {
  console.error('找不到 Wrangler 配置:', configPath, '\n请先执行: pnpm exec wrangler login');
  process.exit(1);
}

const raw = fs.readFileSync(configPath, 'utf8');
const m = raw.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!m) {
  console.error('配置中无 oauth_token');
  process.exit(1);
}
const token = m[1];

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

const getRes = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
  { headers: { Authorization: headers.Authorization } },
);
const getJson = await getRes.json();

if (getJson.success && getJson.result?.subdomain) {
  console.log('已存在 workers.dev 子域:', `${getJson.result.subdomain}.workers.dev`);
  process.exit(0);
}

const sub = `hamhome-${crypto.randomBytes(4).toString('hex')}`;
const putRes = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
  {
    method: 'PUT',
    headers,
    body: JSON.stringify({ subdomain: sub }),
  },
);
const putJson = await putRes.json();

if (!putRes.ok || !putJson.success) {
  console.error('注册子域失败:', putRes.status, JSON.stringify(putJson, null, 2));
  process.exit(1);
}

console.log('已注册 workers.dev 子域:', `${putJson.result.subdomain}.workers.dev`);
console.log('Worker 将位于: https://hamhome-api.' + putJson.result.subdomain + '.workers.dev');
