# Architecture

How the pieces fit together, and why the boundary between them is drawn where it is.

## Systems in play

```
┌──────────────┐   web call   ┌────────────────┐   HTTPS   ┌─────────────────┐   TCP    ┌────────────┐
│              │◄────────────►│                │◄─────────►│                 │◄────────►│            │
│   Carrier    │              │   HappyRobot   │           │  Backend        │          │ Legacy TMS │
│  (browser)   │              │  Voice Agent   │           │  (NestJS/       │          │  (TCP,     │
│              │              │  + Workflow    │           │   Railway)      │          │  fixed-    │
└──────────────┘              └────┬───────────┘           └────────┬────────┘          │  width)    │
                                   │                                │                    └────────────┘
                                   │ Twin dump (native)             │ HTTPS
                                   ▼                                ▼
                          ┌────────────────┐             ┌─────────────────┐
                          │  Twin table    │             │  FMCSA public   │
                          │ carrier_call_  │             │  REST (US Gov)  │
                          │ log            │             └─────────────────┘
                          └────────┬───────┘
                                   │ SQL
                                   ▼
                          ┌────────────────┐
                          │ HappyRobot     │
                          │ Apps dashboard │
                          │ (Next.js)      │
                          └────────────────┘
```

## Component roles

### HappyRobot Platform
- **Voice agent** — speech-to-text, LLM decisioning, text-to-speech, interruption handling
- **Workflow** — the ordered set of "tool nodes" the LLM can invoke on each turn
- **Web call trigger** — carrier initiates the call from a browser (no phone number provisioned, per PDF requirement)
- **Twin** — HappyRobot's native data store; a Workflow Dump table (`carrier_call_log`) auto-captures one row per call from the workflow's tool parameters
- **Apps** — Next.js-based operational dashboard, reads Twin via `src/lib/twin.ts` gateway

**Does NOT do:** talk to the TMS, hold the negotiation ceiling, generate/store OTP codes, decide handoff eligibility. See "Why" section below.

### Backend service (this repo)
Eight HTTP endpoints called as tools by the HappyRobot workflow.

- **FMCSA verify** — proxies to the public registry, returns `eligible: yes/no`
- **OTP send / verify** — generates the code server-side, delivers via email, checks the caller's response
- **Loads search / detail / book** — bridges to the Legacy TMS via its TCP protocol
- **Negotiate evaluate / reset** — the negotiation state machine (holds `MAX_BUY` server-side)
- **Handoffs enqueue** — stateless mock of the senior-rep queue; returns synthetic queue position + ETA

**Why NestJS + TypeScript:** typed contracts at the API boundary, mature DI, first-class Docker story.

**No call persistence in the backend.** Twin is the source of truth for call outcomes. The backend focuses on what it uniquely enables (secrets, TMS bridge, mock queue).

### Legacy TMS
- Fixed-width TCP protocol. Sends `CMD:LOAD_QUERY|AUTH:...|ORIG_CITY:ATLANTA...\r\n`, receives text records terminated by `END\r\n`
- 4 documented fault modes: silent timeout, partial response, malformed frame, delayed termination
- Not modifiable — this is the constraint the case is testing

### FMCSA Public API
- Free US Government REST endpoint. `GET /qc/services/carriers/docket-number/{mc}?webKey=...`
- Returns carrier legal name, DOT number, and operating authority status

## Request flow — a happy-path call

```
1. Carrier clicks web-call link
   → HappyRobot generates session_id, starts audio pipeline

2. Agent: "What's your MC?"
   Carrier: "76400"
   → verify_carrier tool → POST /carriers/verify {mc_num: "76400"}
     → FMCSA lookup → returns {eligible: true, legal_name: "HAMMER LANE TRUCKING LLC"}

3. Agent: "Sending code to di*****@hammerlane..."
   → send_otp tool → POST /otp/send {mc_num: "76400", channel: "email"}
     → backend generates 6-digit code, stores in-memory Map, dispatches email

4. Carrier reads code back
   → verify_otp tool → POST /otp/verify {mc_num: "76400", code: "483920"}
     → backend compares against in-memory store, returns {valid: true}

5. Agent: "What lane?"
   Carrier: "San Jose to Mobile, dry van"
   → search_loads tool → POST /loads/search {...}
     → backend normalizes "dry van" → "DRY_VAN"
     → backend opens TCP to TMS, sends CMD:LOAD_QUERY, reads response, parses
     → returns array of loads

6. Agent pitches load
   Carrier offers a rate
   → evaluate_offer tool → POST /negotiate/evaluate {call_id, load_id, offer, ...}
     → backend fetches MAX_BUY from TMS on first call, caches per-call
     → accept/counter/reject decision made server-side
     → returns {action, counter_offer?} — never returns MAX_BUY

7. If accept → book_load tool → POST /loads/book → TMS CMD:LOAD_BOOK
   → returns booking reference

8. Agent asks carrier for callback number, then:
   → enqueue_handoff tool → POST /handoffs/enqueue {call_id, mc_num, load_id, booking_ref, agreed_rate, callback_number, notes}
     → backend logs the intent, returns {handoff_id, position_in_queue, eta_minutes}

9. Agent: "You're all set. Senior rep will call back in about 10 minutes."
   → log_call tool (workflow variable capture only — no backend call)
   → workflow ends
   → HappyRobot Twin dump writes one row to carrier_call_log with fields from
     log_call + enqueue_handoff tool parameters
```

## Design boundary — what runs where and why

| Concern | Runs in | Rationale |
|---|---|---|
| Speech ↔ text, dialog | HappyRobot | Their core competence, would be foolish to rebuild |
| Deciding which tool to call | HappyRobot (LLM) | The LLM is the natural place for this |
| **The value of MAX_BUY** | **Backend only** | If MAX_BUY were in the LLM's context, adversarial prompting could extract it |
| **The generated OTP code** | **Backend only** | Same reason — cannot leak what isn't there |
| TMS protocol translation | Backend | LLM has no way to speak fixed-width TCP |
| FMCSA lookup | Backend | Could be direct from HR, centralized here for logging/caching |
| Negotiation state (round count, per-call anchor) | Backend | Needs to be deterministic and consistent across turns |
| Mock senior-rep queue | Backend | Represents the real dispatcher queue in production; stateless mock for POC |
| Call transcript, tool trace, recording | HappyRobot run history (native) | HappyRobot captures every turn automatically |
| **Structured call outcome record** | **HappyRobot Twin** | Native data layer; Workflow Dump auto-populates from tool params. See [`06-data-layer.md`](./06-data-layer.md) |
| Ops dashboard | HappyRobot Apps (Next.js) | Native operational UI, reads Twin directly via SQL |

## What is NOT built (mocks and boundaries)

- **Senior rep handoff.** The PDF says web calls can't do live transfers — so at accept, the agent verbally captures a callback number, calls `enqueue_handoff` (stateless mock returning position + ETA), then hangs up. In production this would push to a real dispatcher queue (SQS, Slack channel, or dedicated CRM tab).
- **Carrier contact list.** A hard-coded map of 6 sample MC numbers → email/phone. Production would read from your CRM.
- **SMS OTP channel.** The API accepts `channel: "sms"` but falls back to email (SMS delivery not wired). Adding Twilio is a 30-line change.
- **Real email delivery.** OTP codes attempt to send via Resend if `RESEND_API_KEY` is set; otherwise they're logged to Railway output for demo purposes.
