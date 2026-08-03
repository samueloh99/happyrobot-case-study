# API Reference

Every endpoint is prefixed `/api/v1` and requires `Authorization: Bearer <BACKEND_API_KEY>`, except `GET /health`.

Content-Type on all POSTs: `application/json`.

Response envelope for successes: the payload directly (no wrapper).
Response envelope for errors: `{error, message, statusCode, path}`.

## Health

### `GET /health` — liveness (public)

**Auth:** none.

**Response 200:** `{status: "ok"}`

---

## Carriers

### `POST /carriers/verify` — FMCSA active-authority check

**Request:**
```json
{ "mc_num": "76400" }
```
- `mc_num`: string, 5-8 digits.

**Response 200 (eligible):**
```json
{
  "eligible": true,
  "mc_num": "76400",
  "dot_number": "3098288",
  "legal_name": "HAMMER LANE TRUCKING LLC",
  "status_code": "A",
  "allowed_to_operate": "Y"
}
```

**Response 200 (ineligible):**
```json
{
  "eligible": false,
  "reason": "not authorized (allowedToOperate=Y, statusCode=I)",
  "mc_num": "872144"
}
```

**Error:** 503 if FMCSA is down.

---

## OTP

### `POST /otp/send` — generate + deliver code to contact on file

**Request:**
```json
{ "mc_num": "76400", "channel": "email" }
```
- `channel`: `"email" | "sms"`. Defaults to `email`. SMS currently falls back to email.

**Response 201:**
```json
{
  "sent": true,
  "channel": "email",
  "masked_destination": "di******@hammerlane.example.com",
  "expires_in_seconds": 300
}
```

**Response 404:** contact not on file for that MC number.

**Notes.**
- Code is 6 digits, generated server-side via `randomInt`.
- Stored in-memory keyed by MC. Second call to `send` for the same MC overwrites (resets attempts).
- Default TTL 300s, default max attempts 5. Configurable via env.

### `POST /otp/verify` — validate carrier-spoken code

**Request:**
```json
{ "mc_num": "76400", "code": "483920" }
```

**Response 200 (success):**
```json
{ "valid": true }
```

**Response 200 (failure):**
```json
{ "valid": false, "reason": "mismatch", "attempts_left": 4 }
```
`reason` is one of: `not_found`, `expired`, `mismatch`, `exhausted`.

---

## Loads (Legacy TMS)

### `POST /loads/search` — search by lane / equipment

**Request (all fields optional, at least one required):**
```json
{
  "origin_city": "San Jose",
  "origin_state": "CA",
  "origin_zip": "95113",
  "destination_city": "Mobile",
  "destination_state": "AL",
  "destination_zip": "36602",
  "equipment_type": "dry van",
  "max_results": 5
}
```
- `equipment_type` is normalized on the backend: `"dry van"`, `"vans"`, `"reefer trailer"`, `"flat"` etc. all resolve to one of `DRY_VAN | REEFER | FLATBED`.
- `max_results`: 1-20, default 10.

**Response 200:**
```json
{
  "data": [
    {
      "load_id": "LD00516",
      "origin": {"city": "San Jose", "state": "CA", "zip": "95113"},
      "destination": {"city": "Mobile", "state": "AL", "zip": "36602"},
      "pickup_datetime": "2026-08-08T18:52:00Z",
      "delivery_datetime": "2026-08-09T14:52:00Z",
      "equipment_type": "DRY_VAN",
      "loadboard_rate": 5080,
      "miles": 1981,
      "weight": 9342,
      "commodity": "Paper Products",
      "num_of_pieces": 2,
      "dimensions": "46ft x 8ft x 9ft",
      "notes": "",
      "status": "OPEN"
    }
  ],
  "total": 1
}
```

**Note.** `max_buy` is intentionally omitted from search results — it's only accessible via `/loads/:id` and only used server-side by the negotiation service.

**Errors:** 400 (unknown equipment_type, invalid state/zip format), 503 (TMS unreachable or fault).

### `GET /loads/:loadId` — full detail for one load

**Response 200:** same shape as one item in `search.data`, plus `max_buy`.

**Errors:** 404 (unknown load), 503 (TMS unreachable).

### `POST /loads/book` — commit booking (no retries)

**Request:**
```json
{ "load_id": "LD00516", "mc_num": "76400", "agreed_rate": 5800 }
```

**Response 201:**
```json
{
  "load_id": "LD00516",
  "booking_ref": "49KTHPFER28HXNVM",
  "status": "PENDING",
  "timestamp": "2026-08-02T13:45:00Z",
  "agreed_rate": 5800
}
```

**Errors:**
- 404 — unknown load
- 503 `"load is already booked"` — TMS state conflict
- 503 `"TMS rejected the rate"`
- 503 `"booking transport failed (<kind>); status uncertain, do not retry automatically"` — network fault. **Caller must not retry.**

---

## Negotiation

### `POST /negotiate/evaluate` — accept / counter / reject

**Request:**
```json
{
  "call_id": "<HappyRobot session_id>",
  "load_id": "LD00516",
  "mc_num": "76400",
  "offer": 6500
}
```
- `call_id` is opaque; the negotiation service uses it to track per-call round count.
- `offer` accepts integers or JSON-quoted strings (`6500` or `"6500"`) — coerced on the backend.

**Response 200 (accept):**
```json
{ "action": "accept", "round": 2, "final": true, "agreed_rate": 5800 }
```

**Response 200 (counter):**
```json
{ "action": "counter", "round": 1, "final": false, "counter_offer": 5790 }
```

**Response 200 (reject after 3 rounds):**
```json
{ "action": "reject", "round": 3, "final": true, "reason": "max rounds reached without agreement" }
```

**Rules (server-side, never disclosed):**
- If `offer <= max_buy`: accept at `offer`.
- Else if `round >= MAX_ROUNDS (default 3)`: reject.
- Else: counter with `midpoint(anchor, offer)`, capped at `max_buy - 50`.
- Anchor starts at `loadboard_rate` and rises to each counter as the negotiation progresses.

**Response NEVER includes `max_buy`.** By design.

### `POST /negotiate/reset` — clear session (used on hangup)

**Request:** `{ "call_id": "..." }`

**Response 200:** `{ "reset": true }`

---

## Handoffs

### `POST /handoffs/enqueue` — mock the senior-rep handoff after booking success

**Request:**
```json
{
  "call_id": "<HappyRobot session_id>",
  "mc_num": "76400",
  "load_id": "LD00516",
  "booking_ref": "49KTHPFER28HXNVM",
  "agreed_rate": 5800,
  "callback_number": "+15551234567",
  "notes": "Booked SJC to MOB at 5800; carrier ready for Tuesday pickup"
}
```

- All fields except `callback_number` and `notes` are required.
- Numeric fields accept string representations (`"5800"` → `5800`).
- Empty strings on optional fields are treated as absent.

**Response 202:**
```json
{
  "handoff_id": "HO-35CE42D4CF07",
  "position_in_queue": 1,
  "eta_minutes": 10,
  "accepted_at": "2026-08-03T00:59:08.784Z",
  "message": "Senior rep queue accepted the handoff. Position 1, estimated callback in 10 minutes."
}
```

**Behavior:** stateless mock. Logs the handoff intent to stdout (visible in Railway) and returns synthetic queue metadata. No persistence — the durable record lives in Twin's `carrier_call_log` via workflow dump. See [`06-data-layer.md`](./06-data-layer.md).

---

## Call activity

Call activity is captured natively by HappyRobot's Twin data layer (Workflow Dump on the `carrier_inbound_call` workflow → `carrier_call_log` table). There is no backend endpoint for this — the platform writes one row per workflow run at run end, sourced from the `log_call` and `enqueue_handoff` tool parameters.

See [`06-data-layer.md`](./06-data-layer.md) for the schema and query patterns.

For northstar KPI computation from this table, see [`09-northstar-kpis.md`](./09-northstar-kpis.md).

