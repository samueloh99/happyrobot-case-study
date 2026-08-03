# Legacy TMS Integration

The TMS is the hardest part of this build. It's a stand-in for the 90s-era systems that real freight brokerages actually have in production. This document covers the wire protocol, the fault modes, and the integration strategy.

## Protocol

- **Transport:** raw TCP socket. No TLS.
- **Encoding:** ASCII. Fixed-width, line-based.
- **Frame terminator:** `\r\n`.
- **Max frame size:** 4096 bytes.
- **Response terminator:** `END\r\n` (success) or `ERR|CODE|message\r\n` (error).

## Request format

```
CMD:<command>|AUTH:<token>|<KEY>:<VALUE>|<KEY>:<VALUE>|...\r\n
```

- Fields are `|`-separated. Values must not contain `|` or `\r\n`.
- Keys and values are separated by the first `:` on the field (values may contain colons, keys may not).

## Commands used

| Command | Purpose | Retry policy |
|---|---|---|
| `LOAD_QUERY` | Search loads by filters (origin, destination, equipment) | 2 retries with jitter |
| `LOAD_GET` | Full detail for one load, including `MAX_BUY` | 2 retries with jitter |
| `LOAD_BOOK` | Commit a booking | **0 retries** |
| `DEBUG_ECHO` | Roundtrip health check (unused in prod paths) | 0 retries |

## Response format

Multiple record lines, each `|`-separated key:value pairs, terminated by a single `END\r\n` line:

```
LOAD_ID:LD00516|ORIG_CITY:San Jose|ORIG_STATE:CA|EQTYPE:DRY_VAN|RATE:5080|...|MAX_BUY:6020\r\n
LOAD_ID:LD00517|...\r\n
END\r\n
```

Or a single error line:

```
ERR|MISSING_FIELD|Invalid EQTYPE\r\n
```

## Documented fault modes (all 4 handled)

The TMS is known to be unreliable under load. Four fault categories are documented in the protocol reference. Our client (`src/modules/tms/tms.client.ts`) handles each.

### Fault 1: silent timeout

Server accepts the connection, receives the request, but sends nothing before the client's timeout fires.

**Handling.** Client-side timeout on the socket. On fire, we throw `TmsFaultError('timeout')`, retry for idempotent commands (`LOAD_QUERY`, `LOAD_GET`).

### Fault 2: partial response

Server sends some record lines but never sends `END\r\n` or `ERR`.

**Handling.** Same as fault 1 — the completion detector doesn't see a terminator before timeout. Retry for reads, fail loudly for `LOAD_BOOK`.

### Fault 3: malformed frame

Server sends garbage: unexpected characters, missing `\r\n`, corrupted field structure.

**Handling.** Parser throws `TmsFaultError('malformed')` when it can't split a line into valid `KEY:VALUE` pairs, or when the response is neither a valid record stream nor a well-formed error. Retry for reads, fail loudly for `LOAD_BOOK`.

### Fault 4: delayed termination

Server sends the complete valid response (`...END\r\n`) but doesn't close the socket. Naive clients wait for FIN forever.

**Handling.** Our completion detector operates at the buffer level: as soon as we see `END\r\n` at the end of the accumulated buffer (or `ERR|...\r\n`), we treat the response as complete and proactively close the socket ourselves. Never blocked on the server.

## Retry policy — the asymmetry

```
LOAD_QUERY / LOAD_GET    → attempts=3, jitter 150-400ms between retries
LOAD_BOOK                → attempts=1 (no retry)
```

**Why the asymmetry.** `LOAD_QUERY` and `LOAD_GET` are read-only. Retrying is safe — the response is the same.

`LOAD_BOOK` mutates state. Consider this scenario:
1. Client sends `CMD:LOAD_BOOK|LOAD_ID:LD00516|MC:76400|RATE:5800\r\n`
2. TMS commits the booking, generates a booking ref
3. Network dies before the TMS response reaches the client
4. Client sees a timeout — did the booking commit?

If we retry: potential double-book. Broken customer promise. Real money at stake.
If we don't retry: at most one booking commits. Uncertain state, but recoverable via manual reconciliation.

**We chose "at most once" over "at least once."** On `LOAD_BOOK` fault, we return 503 with:

> `booking transport failed (<kind>); status uncertain, do not retry automatically`

The voice agent tells the carrier: *"I'm not sure your booking went through. A senior rep will call you back within 15 minutes to confirm."* Then the call ends. `log_call` records `outcome: "booking_failed"` so the ops team knows to investigate.

## Field width tolerance

The TMS pads values to fixed widths with trailing spaces. Our parser calls `trimEnd()` on every value. This is documented in the protocol reference and observed in smoke tests during build.

## Connection strategy

- One TCP connection per request. No connection pooling.
- Connection closed immediately after response (or on fault).
- Auth token sent on every command in the `AUTH` field. No session state on the TMS side.

**Why not pool?** The TMS is unreliable enough that a pooled connection could carry stale state or die between requests. Simpler and safer to open, use, close.

**Cost.** Connection setup on every call. At POC scale, negligible. In production, revisit if latency becomes a concern.

## Equipment normalization — bridging voice speech to strict enum

The TMS accepts exactly three equipment strings: `DRY_VAN`, `REEFER`, `FLATBED`. Nothing else. But voice carriers say "van", "vans", "reefer trailer", "flat bed", "temp control", "chill", "step deck", "trailer", etc.

**Solution:** `src/modules/tms/equipment.ts` — a substring-based normalizer that maps ~20 variants to the 3 canonical values. Priority: REEFER keywords (`refrig`, `reefer`, `chill`, `frozen`, `temp`) → FLATBED keywords (`flatbed`, `flat`) → DRY_VAN keywords (`dry`, `van`, `trailer`, `53 foot`). Unknown terms ("conestoga", "step deck") return 400 with the accepted-values list, and the voice agent re-asks the carrier.

The LLM sends whatever the carrier said. The backend normalizes. Neither has to know the other's constraints.

## Observability

Every TMS interaction logs to Railway output with the request ID:

```
[TmsClient] LOAD_QUERY attempt 1 failed (timeout); retry in 255ms
[TmsClient] LOAD_QUERY succeeded on attempt 2
```

Faults are counted at the log-scan level. In production, these should be structured metrics (Datadog / New Relic / etc.) with alerting on fault rate.

## What NOT to do

- **Do not** put TMS credentials in the LLM's context. They stay in backend env only.
- **Do not** expose raw TMS records to the voice agent. Translate to typed JSON first — the LLM shouldn't have to parse fixed-width text.
- **Do not** retry `LOAD_BOOK`. Ever. This is the single most important operational rule in the integration.
