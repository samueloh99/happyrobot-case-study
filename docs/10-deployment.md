# Deployment & Operations

Containerized (Docker), single-command deploy to any cloud target. Currently running on Railway.

## Current deployment

- **Platform:** Railway
- **URL:** `https://happyrobot-case-study-production.up.railway.app/api/v1`
- **Build:** GitHub push → Railway auto-detects Dockerfile → builds → deploys
- **Container:** Node 20 alpine, non-root user, ~150 MB image
- **Health check:** `GET /api/v1/health` (public, returns 200 with `{status: "ok", ts: "..."}`) — also wired into the Dockerfile's `HEALTHCHECK` directive so any Docker-aware runtime (K8s, ECS, Cloud Run, Fly.io) can report container health

## Single-command deploy

**Railway (current target):**
```bash
railway login
railway link <project>
railway up
```

**Anywhere else (Docker Compose):**
```bash
docker compose up --build
```

**Anywhere else (raw Docker):**
```bash
docker build -t happyrobot-carrier-sales .
docker run --env-file .env -p 3000:3000 happyrobot-carrier-sales
```

Railway first deploy ~90s. Redeploys ~60s. The Dockerfile is cloud-agnostic — no Railway-specific paths or env vars leak into the code.

## Environment variables (required)

Set these in the Railway dashboard → Service → Variables (or `.env` for Docker Compose):

| Var | Purpose | Example |
|---|---|---|
| `NODE_ENV` | runtime mode | `production` |
| `PORT` | HTTP listen port | `3000` default; Railway auto-sets to its own |
| `BACKEND_API_KEY` | Bearer token for all `/api/v1/*` except `/health` | **32+ random chars** — enforced by Zod. Generate with `openssl rand -hex 32` |
| `TMS_HOST` | Legacy TMS TCP host | provided by case study |
| `TMS_PORT` | Legacy TMS TCP port | provided by case study |
| `TMS_TOKEN` | Personal TMS auth token | provided by case study |
| `TMS_CLIENT_TIMEOUT_MS` | Socket timeout | `4000` |
| `FMCSA_BASE_URL` | FMCSA API base | `https://mobile.fmcsa.dot.gov/qc/services` |
| `FMCSA_WEB_KEY` | FMCSA public API key | free from FMCSA portal |
| `OTP_TTL_SECONDS` | OTP expiry | `300` |
| `OTP_MAX_ATTEMPTS` | Wrong-code allowance | `5` |
| `NEGOTIATION_MAX_ROUNDS` | Rounds before reject | `3` |
| `NEGOTIATION_SESSION_TTL_SECONDS` | Per-call session TTL | `900` |
| `RESEND_API_KEY` | (optional) Resend email API key | if set, OTP emails send; else logged to stdout |
| `RESEND_FROM` | (optional) Sender email | `noreply@yourdomain.com` |

Missing any required var → the process fails at startup with a validated error (Zod schema in `src/config/env.ts`).

## Dockerfile — how it's built

Two-stage build:

**Stage 1 (`builder`):**
- Base `node:20-alpine`
- Enables `corepack` (for pnpm 9)
- Copies `package.json` + lockfile, installs with `--frozen-lockfile` (strict; fails on lockfile drift)
- Copies source + configs, runs `pnpm build`
- Prunes dev dependencies

**Stage 2 (`runner`):**
- Base `node:20-alpine`
- Sets `NODE_ENV=production` and `PORT=3000`
- Creates non-root `app` user
- Copies `node_modules`, `dist`, and `package.json` from builder (with `--chown=app:app`)
- Switches to non-root user
- `HEALTHCHECK` via `wget --spider` on `/api/v1/health` every 30s
- Runs `node dist/main.js`

Final image is ~150 MB, non-root, minimal attack surface.

## Local development

```bash
pnpm install
cp .env.example .env  # fill in TMS_TOKEN, FMCSA_WEB_KEY, BACKEND_API_KEY at minimum
pnpm start:dev
```

Server listens on `http://localhost:3000/api/v1`.

**Or via Docker Compose:**
```bash
cp .env.example .env
docker compose up
```

Same env vars; the compose file mounts them from `.env` and adds a healthcheck the container runtime honors.

## Observability

Every request is logged with a structured line in Railway output:

```
[HTTP] [<request_id>] METHOD /api/v1/... → <status> (<duration_ms>ms)
```

The `request_id` is generated from an inbound `X-Request-Id` header when present (HappyRobot can inject one for end-to-end tracing), or a fresh UUID otherwise. The same ID appears on the response header `X-Request-Id` AND on any error log emitted by the global exception filter — so a client-side error can be traced to the exact backend log line by ID.

TMS transport activity has its own log lines (search for `TmsClient` in Railway logs):

```
[TmsClient] LOAD_QUERY attempt 1 failed (timeout); retry in 255ms
[TmsClient] LOAD_QUERY succeeded on attempt 2
[TmsService] LOAD_BOOK fault (timeout) — DO NOT retry, may have succeeded server-side
```

## Operations runbook

### If the backend is down

1. Check Railway dashboard → Deployments → most recent status.
2. Check application logs (Railway → Deployments → View Logs).
3. Common causes:
   - **Missing env var** → startup crash with clear message (Zod validated).
   - **`BACKEND_API_KEY` too short** → startup crash with `must be at least 32 chars`.
   - **TMS unreachable** → `/loads/*` endpoints return 503, `/health` still 200.
   - **FMCSA rate limit** → `/carriers/verify` returns 503.

### If bookings are failing

1. Check Twin `carrier_call_log` for elevated `booking_failed` outcomes:
   ```sql
   SELECT log_call_load_id, log_call_notes
   FROM carrier_call_log
   WHERE log_call_outcome = 'booking_failed'
   ORDER BY started_at DESC LIMIT 10;
   ```
2. Cross-reference with Railway logs (`grep TmsClient`) — booking faults are logged as ERROR with fault kind (`timeout`, `partial`, `malformed`).
3. **Never manually retry a failed booking without confirming TMS state first** — see [`07-tms-integration.md`](./07-tms-integration.md).

### If the OTP flow is broken

1. Check that `send_otp` returns 201, not 404. If 404 for real MCs, the mock contact list needs an entry (or in production, the CRM lookup is broken).
2. If `verify_otp` always returns `mismatch`, check that the code the carrier hears matches the one in the Railway logs. If they differ, the email delivery is stale — try again with a fresh call.
3. If neither: check the OTP TTL. If the carrier waited > 5 min between `send` and `verify`, the code expired.

### If negotiation always rejects

Symptom: `evaluate_offer` returns `reject` before round 3.

Cause: `MAX_BUY` is `null` on the load (TMS didn't expose it). Verify:
```
curl -sS $BASE/loads/LD00516 -H "Authorization: Bearer $KEY" | jq .max_buy
```
Should return an integer. If `null`, the TMS token doesn't have the `MAX_BUY` flag enabled — contact TMS admin.

### Rotating the API key

1. Generate a new key: `openssl rand -hex 32`
2. Update Railway var `BACKEND_API_KEY` → save (triggers redeploy in ~60s)
3. Update the HappyRobot workflow's webhook `Authorization` header on all 8 webhook nodes:
   `verify_carrier`, `send_otp`, `verify_otp`, `search_loads`, `get_load_detail`, `evaluate_offer`, `book_load`, `enqueue_handoff`
4. Republish the workflow (`manage_versions action=publish force=true`)

Both sides must match. There's no key-rotation grace window (POC-scale simplification). Two people would coordinate a short maintenance window in production.

## Wiping demo data

Call activity lives in Twin's `carrier_call_log`. To clear:

```sql
DELETE FROM carrier_call_log;
```

Run in the Twin SQL Console. If you want to keep historical rows but start a fresh demo cohort, add a `demo_batch_id` column and filter on it in the dashboard.

## Cost profile (POC)

- Railway starter plan: ~$5/month
- FMCSA API: free
- Resend (if used): free tier covers first 3,000 emails/month
- HappyRobot platform: per-minute voice charges (variable)
- Twin: included with the workspace (20 GB provisioned in this deployment)

**Not scaling costs:** TMS licensing, senior rep queue integration, CRM integration — all customer-side.

## What's NOT in this deployment

- Multi-region. Single Railway region.
- Load balancing beyond Railway's autoscaling. Multi-instance would need the OTP/negotiation state moved to Redis first (see [`03-design-decisions.md`](./03-design-decisions.md) #6).
- Application-level metrics (Datadog / OpenTelemetry). Railway shows deployment status and request-level logs.
- Rate limiting on OTP endpoints. Attempt counter mitigates but isn't a full defense.

These are all deferred to a production hardening phase, not because they're hard, but because they're not what the POC is proving.
