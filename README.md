# Daily Digest

AI-assisted daily digest system with admin subscription management, scheduled delivery, and one-click release for Cloudflare Workers.

## What this repo is

This project contains:

- Digest API on Cloudflare Workers (`packages/api`)
- D1 schema/migrations (`packages/db`)
- Web admin console for digest subscriptions (`apps/web`)
- Shared types (`packages/types`)

## Key features

- Admin subscription CRUD + test send
- Timezone-based local delivery time (`HH:mm`)
- Minute-window scheduler with 10-minute cron trigger
- Per-topic and per-email item limits in pipeline
- One-click release: migrate + deploy + health check

## Quick start

### Install

```bash
pnpm install
```

### Run web UI (local)

```bash
pnpm run dev:web
```

Then open:

- `http://localhost:3000/digest`

### API release (recommended)

```bash
pnpm run api:release
```

This command runs:

1. D1 migrations for digest subscriptions
2. Worker deploy
3. Health check on `/health`

## Environment variables

### API runtime

- `DIGEST_ADMIN_TOKEN`: bearer token for admin digest endpoints
- `DIGEST_ADMIN_OWNER_USER_ID`: owner user id used by admin mode (default: `dev-user-1`)

### Release script

- `HAMHOME_API_URL`: base URL used by health check in release flow
  - default: `https://hamhome-api.hamhome-680ce447.workers.dev`

PowerShell example:

```powershell
$env:HAMHOME_API_URL="https://api.your-domain.com"; pnpm run api:release
```

## Main scripts

From repo root:

- `pnpm run dev:web`
- `pnpm run api:migrate:subscriptions`
- `pnpm run api:deploy`
- `pnpm run api:release`

## Notes

- If migration `0004` reports duplicate column, it usually means that migration was already applied.
- Final release success should be confirmed by `Health OK` output.

## License

MIT
