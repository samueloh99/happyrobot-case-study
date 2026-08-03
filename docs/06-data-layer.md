# Data Layer — Twin

Call activity lives in HappyRobot's native data store (Twin). Twin is the single source of truth for every call outcome — no external database, no local file, no redundant backend storage.

## The table — `carrier_call_log`

A HappyRobot **Workflow Dump** table linked to the `carrier_inbound_call` workflow. HappyRobot writes one row per workflow run automatically at run end, pulling fields from the workflow's tool call parameters.

**Schema:**

| Column | Type | Source |
|---|---|---|
| `run_id` | uuid (PK) | HappyRobot workflow run ID |
| `log_call_outcome` | text | `log_call` tool param — enum: `booked \| no_load_found \| fmcsa_failed \| otp_failed \| negotiation_failed \| booking_failed \| carrier_hangup \| error` |
| `log_call_mc_num` | text | `log_call.mc_num` |
| `log_call_load_id` | text | `log_call.load_id` |
| `log_call_agreed_rate` | integer | `log_call.agreed_rate` (only set for booked calls) |
| `log_call_rounds` | integer | `log_call.rounds` |
| `log_call_notes` | text | `log_call.notes` (LLM-written summary) |
| `enqueue_handoff_mc_num` | text | `enqueue_handoff.mc_num` |
| `enqueue_handoff_load_id` | text | `enqueue_handoff.load_id` |
| `enqueue_handoff_booking_ref` | text | `enqueue_handoff.booking_ref` (TMS booking reference on success) |
| `enqueue_handoff_agreed_rate` | integer | `enqueue_handoff.agreed_rate` |
| `enqueue_handoff_callback_number` | text | `enqueue_handoff.callback_number` (verbally captured from carrier) |
| `enqueue_handoff_notes` | text | `enqueue_handoff.notes` |
| `started_at` | timestamp | call start time (nullable on older rows) |

One row per call captures both the call outcome (via `log_call`) and the handoff intent (via `enqueue_handoff`) — no need to join separate tables.

## Why this shape

**Workflow Dump semantics:** HappyRobot auto-inserts the row at the end of every successful run. No backend call is required to persist — the platform handles it.

**Consequence:** the backend has zero responsibility for durable call storage. It handles only the things it uniquely enables (TMS TCP bridge, FMCSA lookup, OTP guard, `MAX_BUY` protection, stateless handoff mock).

## Access patterns

**Ops dashboard (HappyRobot Apps):** reads Twin directly via SQL through the app template's `src/lib/twin.ts` gateway. See `10-deployment.md` for the app service key setup.

**Ad-hoc queries:** Twin exposes a SQL Console in the platform UI. Example — outcome distribution over all calls:

```sql
SELECT log_call_outcome, COUNT(*)
FROM carrier_call_log
GROUP BY log_call_outcome
ORDER BY 2 DESC;
```

## What about the transcript?

Twin captures the *structured outcome* per call. The full turn-by-turn transcript, tool trace, and call recording all live natively in HappyRobot's run history — accessible via the platform UI or the workflow MCP (`monitor_runs`).

So the audit trail per call is captured in two natural sources:
- **Structured outcome:** Twin `carrier_call_log`
- **Full transcript + tool trace:** HappyRobot run history

Neither requires an external database.

## What we investigated and rejected

Two alternatives were considered before committing to Twin:

1. **JSONL file on the backend.** Shipped first as a placeholder. Removed once Twin was confirmed working. Rejected because:
   - `/tmp` is ephemeral — wiped on container restart
   - No multi-instance concurrency safety
   - Duplicates work Twin already does natively
   - Fails the "must be justified" test for external storage

2. **External Postgres via Railway plugin.** Discussed briefly. Rejected because Twin fully covers the requirement and adding a managed DB introduces its own migration, backup, and cost surface — with no upside at POC scale.

## Constraints noted for production

- **Workflow Dump captures at run end.** In-flight state (currently in-memory in the backend for OTP and negotiation) is intentionally NOT dumped — those are session-scoped, not audit-scoped.
- **Column set is fixed at table creation.** Adding a new tool param the ops team wants captured requires adding a Twin column and re-dumping (backfill supported for last 90 days).
- **Twin is regional.** The workspace uses a specific Twin region (in our env, `twin-use2-06`). Multi-region deployments would require region-specific tables or a federated read layer.
