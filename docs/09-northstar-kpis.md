# Northstar KPIs

The metrics HappyRobot Logistics' ops manager should track to decide whether the automation is working. Which numbers to look at, how they're computed, what a healthy value looks like.

## Two things get called "northstars" — keep them separate

| Concept | Where it lives | What it tracks | Doc |
|---|---|---|---|
| **Business KPIs** (this document) | Twin `carrier_call_log` → HappyRobot Apps dashboard | Business outcomes: booked rate, revenue, avg rounds, outcome mix | this doc |
| **Platform Northstars** (HappyRobot native) | Attached to the `carrier_sales_prompt` node | Per-call AI response quality: rule adherence, tone, sequential correctness | [`08-qa-results.md`](./08-qa-results.md) |

**Business KPIs answer:** "Are we making the brokerage money?"
**Platform Northstars answer:** "Did the agent behave correctly on this call?"

Both matter. Both are configured. This document covers the business KPI framework.

## Framework vs targets

| | Status |
|---|---|
| **Framework** — metric definitions (formula, source, how to read) | Committed for production. Every metric is computable today from Twin `carrier_call_log`. |
| **Targets** — specific thresholds like "≥ 40% booked rate" | Projected estimates. Real thresholds require ~30 days of production traffic to baseline. |

Where a specific target is a projection, it's called out inline.

## The one metric that matters most

**Booked-load rate** — of every inbound carrier call, what percentage ends with a confirmed booking?

Formula: `booked / total_calls`

Baseline (manual dispatchers today): **unknown** — the case study describes operational strain but doesn't quantify current book rate. This is one of the first numbers to establish once the system is live.

Target for the automated system (projected): **≥ 40%** in the first 30 days, **≥ 55%** at maturity.

Why not higher: many inbound carriers call about lanes we don't have loads for, or with an MC that fails FMCSA — those are legitimate no-books, not defects.

## Supporting KPIs

### 1. Outcome distribution

The `by_outcome` breakdown from `GET /calls/stats`. Every call ends in exactly one of these:

| Outcome | Meaning | Healthy trend |
|---|---|---|
| `booked` | Deal closed, load committed | ↑ up and to the right |
| `no_load_found` | Carrier's lane didn't match inventory | stable — market condition, not defect |
| `fmcsa_failed` | Carrier not authorized | stable — legal filter, not defect |
| `otp_failed` | Couldn't verify identity | ↓ down — high count suggests bad contact data |
| `negotiation_failed` | 3 rounds, no deal | ↓ down — high count suggests ceiling too low OR carriers pricing too high |
| `booking_failed` | Booking committed at TMS layer failed | ↓ down (target ~0) — indicates TMS or state issue |
| `carrier_hangup` | Carrier ended call before flow completed | stable — mixed causes |
| `error` | Unhandled exception | 0 (any occurrence is a defect to investigate) |

Validation status: **framework proven in POC.** All 8 outcomes were exercised across the QA test runs (see `08-qa-results.md`) and correctly recorded.

### 2. Average agreed rate

`GET /calls/stats → average_agreed_rate`.

Should trend near (but not at) the average `loadboard_rate`. If it drifts up toward `MAX_BUY`, dispatchers (or in our case, the agent) are leaving margin on the table.

**Why this matters as a KPI:** it verifies the ceiling protection is not just holding, but working efficiently. A rate at exactly `MAX_BUY` means the counter logic is capitulating; a rate near `loadboard_rate` means we're capturing full margin. The target range is somewhere in between.

Validation status: **computable today** from live data. Target range needs 30-day baseline.

### 3. Average negotiation rounds

`GET /calls/stats → average_rounds`.

Projected target: **1.5 – 2.0**. If it's 1.0, agent is accepting too eagerly. If it's 3.0, agent is over-negotiating and losing deals.

Validation status: **POC data supports the range.** In our test runs, average was 2.0 (one round for direct accept, three for a walk-away). Production baseline will refine.

### 4. Booked revenue

`GET /calls/stats → booked_revenue`.

Sum of `agreed_rate` across all booked calls. The topline dollar impact. Chart this week over week — it should scale with `booked` count and reflect any lane-mix changes.

Validation status: **computable today.** No target — it's a level metric, not a threshold metric.

### 5. Time-to-book (not yet computed, roadmap item)

Duration from call start to booking commit.

Rough projected target: median booked call **< 4 minutes** (vs. estimated ~8 min manual).

Validation status: **not implemented.** Not in the log today — would require adding call start timestamp to `LogCallDto` and computing delta at log time.

### 6. Adversarial defense signal (qualitative)

Not a metric per se, but tracked via periodic review of transcripts:

- **`MAX_BUY` disclosures per 100 calls** — target: 0
- **OTP bypass attempts honored** — target: 0
- **Loads booked without prior `search_loads` hit** — target: 0 (technically impossible, but audit-worthy)

Validation status: **0/9 defenses failed** in POC adversarial tests. See `08-qa-results.md` scenarios A1–A4.

## How to read the dashboard

Real ops manager questions and how the KPIs answer them:

- **"Are we saving dispatcher time?"** → `booked` + `no_load_found` + `fmcsa_failed` + `negotiation_failed` = calls that never touched a human's ear. Ratio of this to total = time saved.
- **"Are we capturing margin?"** → `average_agreed_rate` vs. `average_loadboard_rate`. Delta = margin per booking. Multiply by `booked` count = weekly margin.
- **"Is the AI making bad calls?"** → `error` count > 0 is the alert. Also spike in `booking_failed` = TMS integration wobbly. Also spike in `otp_failed` = data quality issue with carrier contacts.
- **"Should we widen or tighten the ceiling?"** → high `negotiation_failed` rate suggests ceiling is too tight for the current market. Trend over time reveals when the ceiling model needs re-tuning.

## What's NOT a good KPI

- **Call duration alone.** A 30-second call isn't necessarily good (could be a FMCSA fail); a 6-minute call isn't necessarily bad (could be a productive negotiation). Duration matters only inside a specific outcome cohort.
- **Number of tools invoked.** Meaningless — it's a function of the flow, not agent quality.
- **LLM token cost.** Real, but a symptom, not a business metric. Track separately in your cloud bill.

## Where to see this today

The source of truth is Twin's `carrier_call_log` table. All KPIs above compute from a handful of SQL queries.

**Total, booked, revenue, avg rate, avg rounds in one query:**

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE log_call_outcome = 'booked') AS booked,
  SUM(log_call_agreed_rate) FILTER (WHERE log_call_outcome = 'booked') AS booked_revenue,
  ROUND(AVG(log_call_agreed_rate) FILTER (WHERE log_call_outcome = 'booked')) AS avg_agreed_rate,
  ROUND(AVG(log_call_rounds), 2) AS avg_rounds
FROM carrier_call_log;
```

**Outcome distribution:**

```sql
SELECT log_call_outcome, COUNT(*)
FROM carrier_call_log
GROUP BY log_call_outcome
ORDER BY 2 DESC;
```

The **HappyRobot Apps dashboard** ("Carrier Desk — Operations") is the ops-facing surface. It reads Twin via the `src/lib/twin.ts` gateway in the app template and renders the KPIs above as tiles + charts + a recent-calls table.
