# Call-control flows (Kulloo)

> **Doc hub:** [Documentation index](README.md) — telephony primitives are sibling files in this `doc/` folder (e.g. [kamailio.md](kamailio.md), [esl.md](esl.md)).

Kulloo currently supports **two call-control flows**. They differ only in the **SIP signaling edge**. Everything after the SIP leg lands on FreeSWITCH (ESL, recordings, Mongo persistence, Redis requirements, HTTP API) is shared.

---

## What is a “flow” here?

A flow answers: **what receives the SIP INVITE** and **how the INVITE gets proxied to FreeSWITCH** (while preserving `KullooCallId` for outbound correlation).

Kulloo always relies on **FreeSWITCH + outbound ESL** (`socket ... async full`) to execute the media script and persist state.

**Media script selection (orthogonal to Flow A/B):** `AGENT_MODE` in `backend/src/config/env.ts` chooses **hello** (default IVR), **webrtc** (agent bridge), or **ai_voice** (Deepgram → OpenAI → VEXYL-TTS). See [ai-voice-agent.md](ai-voice-agent.md).

---

## The two flows

| Flow | Default? | SIP edge | Docs |
|------|----------|----------|------|
| **Flow A (default)** | Yes | **Kamailio** SIP load balancer in front of a FreeSWITCH pool | [flow-a-kamailio.md](flow-a-kamailio.md) |
| **Flow B (opt-in)** | No | **Drachtio** (C++ SIP server + Node `drachtio-srf`) in front of FreeSWITCH | [flow-b-drachtio.md](flow-b-drachtio.md) |

---

## If you are an AI agent: which file should you edit?

- **Need to change SIP routing / load balancing (Flow A):** start at [kamailio.md](kamailio.md) and the Compose files under `Docker/`.
- **Need to change SIP proxy behavior in Node (Flow B):** start at [drachtio.md](drachtio.md) and `backend/src/services/drachtio/`.
- **Need to change the hello media flow (answer/play/record/DTMF):** start at [esl.md](esl.md) and `backend/src/services/freeswitch/esl-call-handler.service.ts`.
- **Need to change what the HTTP API does (create call, callbacks, recordings):** start at [api.md](api.md) and `backend/src/modules/`.

---

## Inbound vs outbound (DID vs API-created call)

These are **call directions**, not flows:

- **Inbound (DID)**: typically **no** `KullooCallId` header exists before media; ESL creates the `Call` when FreeSWITCH connects.
- **Outbound (API)**: `POST /api/calls/outbound/hello` creates the `Call` first and injects `KullooCallId`; ESL attaches the FreeSWITCH channel UUID to the pre-created call.

Full docs:

- [inbound-call-dataflow.md](inbound-call-dataflow.md)
- [outbound-calls.md](outbound-calls.md)
