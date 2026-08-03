# Executive Summary

**HappyRobot Logistics — Inbound Carrier Sales Automation POC**

## The problem

HappyRobot Logistics receives inbound calls from carriers looking for loads. Today, a dispatcher handles each one manually: verifies the carrier is legal, sends a code, searches the TMS, negotiates the rate, hands off to a senior rep, and logs the outcome.

Result: missed calls at peak hours, inconsistent rate ceilings (margin leakage), manual FMCSA lookups, no audit trail, and dispatcher burnout on repetitive work.

## The solution

A voice AI agent handles the first leg of every inbound carrier call, without a dispatcher on the line. It performs the same 7 steps a human would — verification, OTP, load search, negotiation, booking, handoff, logging — with two guarantees a human can't provide:

1. **The rate ceiling never leaks.** It literally isn't in the AI's context; the negotiation logic runs server-side.
2. **The OTP flow can't be bypassed.** The code isn't in the AI's context either. No carrier prompt can extract it.

## What was delivered

- A live voice agent that handles inbound web calls end-to-end
- A backend service that bridges the voice agent to the legacy TMS (raw TCP) and FMCSA (public REST)
- Deterministic negotiation with a hard 3-round ceiling
- OTP verification sent to the carrier's contact on file
- Structured call activity captured natively in HappyRobot's Twin data layer
- Stateless mock of the senior-rep handoff queue (position + ETA), captured per-call in Twin
- HappyRobot Apps operational dashboard reading Twin directly
- Native platform quality gating: 20 Northstars and 4 adversarial tests attached to the prompt
- Deployed to production (Railway), containerized, single-command redeploy to any cloud target

## What it changes for the brokerage

| Metric | Before | After |
|---|---|---|
| Peak-hour missed calls | Common | Zero (AI answers every call) |
| Rate ceiling enforcement | Dispatcher discretion | Deterministic — cannot be exceeded |
| FMCSA lookup time | 30-60 sec manual | ~1 sec, no dispatcher effort |
| Audit trail per call | Free-form notes | Structured record (outcome, offer history, transcript) |
| Dispatcher time per call | ~8 min | 0 min for qualified transfers; ~2 min on handoff for booked loads |

## Scope of this POC vs a production deployment

This document describes a proof-of-concept. What's mocked and what would change in production is called out in [`06-data-layer.md`](./06-data-layer.md) and [`10-deployment.md`](./10-deployment.md).
