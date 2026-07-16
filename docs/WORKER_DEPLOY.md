# Clain worker deploy — Option A (dedicated always-on worker)

Real-time inbound message ingestion (and all queued background jobs) needs the
job worker running **continuously**. Vercel functions are stateless and can't
host a long-lived process, so on Vercel the queue is only drained by the daily
`/api/internal/worker/tick` cron — far too slow for inbound messages.

This runbook deploys the **same repo** as a separate always-on worker service.
**No application code changes** — the worker, poll loop, atomic job claiming,
retries and dead-letter are already implemented.

## What runs

`npm run worker` → `server/worker-standalone.ts`:

- `startWorker()` — a poll loop (every `QUEUE_POLL_INTERVAL_MS`, default **1000 ms**).
- Claims jobs atomically via the `claim_next_job()` RPC (`FOR UPDATE SKIP LOCKED`),
  so **multiple replicas are safe** — they never double-process a job.
- Registers every pipeline handler: channel ingest, canonicalizer, intent router,
  reconciler, resolution planner/executor/rollback, draft reply, message sender,
  SLA monitor, agent execute, AI jobs, orchestrator.
- Graceful shutdown on SIGTERM/SIGINT; heartbeat log every 60 s.

## Prerequisites (already satisfied in prod)

- `jobs` table — exists in Supabase ✓
- `claim_next_job()` RPC — exists in Supabase ✓

Nothing to migrate.

## Required env vars

| Var | Value | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | *(secret)* | same as the API |
| `SUPABASE_SERVICE_ROLE_KEY` | *(secret)* | same as the API — worker needs full access |
| `DB_PROVIDER` | `supabase` | |
| `NODE_ENV` | `production` | |
| `QUEUE_POLL_INTERVAL_MS` | `1000` | lower = closer to real-time; 1 s is plenty |
| `QUEUE_CONCURRENCY` | `5` | jobs run in parallel per replica |
| `QUEUE_MAX_ATTEMPTS` | `3` | retries before dead-letter |

Optional (only if you want channel ingestion / Fin to fully run in the worker):
copy the same integration + AI keys the API uses (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, provider tokens, etc.). The worker starts fine without them.

> `tsx` lives in `devDependencies`, so the build installs dev deps too
> (`npm install --include=dev`). Optional later optimization: move `tsx` to
> `dependencies` and use a plain prod install for a leaner image.

## Deploy — Render (recommended, one-click)

1. Render → **New → Blueprint** → pick this repo. It reads `render.yaml`
   (service `clain-worker`, type `worker`).
2. In the service's **Environment**, set the two secrets: `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy. Logs should show `CRM AI standalone worker started` then heartbeats.

Scale later: bump the plan or **increase the instance count** — `SKIP LOCKED`
makes extra replicas safe.

## Deploy — Railway (Procfile)

1. New Project → Deploy from this GitHub repo. Railway detects the `Procfile`
   (`worker: npm run worker`).
2. Set the **Install/Build command** to `npm install --include=dev` (so `tsx`
   is installed), or add `NIXPACKS_INSTALL_CMD=npm install --include=dev`.
3. Add the env vars above (Variables tab). Deploy.

## Deploy — any host / Docker / the Oracle box

```bash
git clone … && cd CRM-AI
npm install --include=dev
export SUPABASE_URL=…  SUPABASE_SERVICE_ROLE_KEY=…  DB_PROVIDER=supabase  NODE_ENV=production
npm run worker
```

Run it under a process supervisor (systemd, pm2, Docker `restart: always`) so it
stays up. For Docker, start command `npm run worker`, Node 22 base image.

## Verify it's working

1. Worker logs show `CRM AI standalone worker started` and periodic heartbeats.
2. `GET https://app.clain.app/api/operations/overview` → `queue.running`/`completed`
   should increase over time (jobs are being drained).
3. Enqueue a test job (or send a real inbound webhook) and confirm the case/message
   appears in the inbox within a couple of seconds.

## Keep the Vercel cron as a backstop

Leave `/api/internal/worker/tick` (`0 12 * * *`) in `vercel.json`. If the worker
service is ever down, the daily tick still drains the backlog — redundancy, not
the primary path.
