# Kulloo documentation

This folder is the **main narrative** for the Kulloo project. It is meant for **people** onboarding or designing features and for **AI assistants** that need accurate architecture and file-placement rules without scanning the whole repository.

**Layout:** All markdown files in this folder live **directly under `doc/`** (flat filenames: `api.md`, `deployment.md`, `esl.md`, etc.). There are no `doc/reference/`, `doc/ops/`, or `doc/telephony/` subdirectories—use the links below.

---

## What is Kulloo?

Kulloo is a **TypeScript/Node calling backend**: an **Express** API, **MongoDB** as the system of record for calls, events, and recordings, and **Redis** (required) for idempotency caching and recording-webhook deduplication. **FreeSWITCH** handles SIP/RTP and media; Kulloo runs an **ESL** (Event Socket) TCP server so FreeSWITCH can connect in and run the scripted “hello” flow (answer, tone, record, DTMF, hangup). **Outbound** calls are often placed via **Plivo** (or other adapters); a stable **`KullooCallId`** links the HTTP-created `Call` document to the media leg on FreeSWITCH.

---

## Repository map (outside `doc/`)

| Path | Role |
|------|------|
| [`backend/`](../backend/) | Main API package — layout and conventions: [backend-folder-structure.md](backend-folder-structure.md). |
| [`freeswitch/`](../freeswitch/) | Checked-in FreeSWITCH configuration (dialplan, modules, vars). |
| [`Docker/`](../Docker/) | **Production Docker**: [`docker-compose.yml`](../Docker/docker-compose.yml) (Flow A — Kamailio), [`docker-compose.flow-b.yml`](../Docker/docker-compose.flow-b.yml) (Flow B — Drachtio), deploy guide ([`Docker/README.md`](../Docker/README.md)). |

**Server deployment (operators):** [deployment.md](deployment.md) — quick path to production Compose and checklist; deep detail in [`Docker/README.md`](../Docker/README.md).

Local run instructions for the API: [`backend/README.md`](../backend/README.md).

---

## How to use this documentation (AI-first)

This `doc/` folder is intended to be **AI-friendly**: it should let an agent answer architecture questions and place new code correctly **without scanning the full repository**.

### AI quickstart (keep these open)

- **Where files go (source of truth):** [backend-folder-structure.md](backend-folder-structure.md) — start at **“Where to put new code”**.
- **HTTP surface (routes + callbacks):** [api.md](api.md).
- **Redis is required (keys/TTLs + why):** [redis.md](redis.md).
- **Call lifecycles + correlation:** [outbound-calls.md](outbound-calls.md), [inbound-call-dataflow.md](inbound-call-dataflow.md), [esl.md](esl.md).
- **Which signaling edge is active (Flow A vs Flow B):** [flows.md](flows.md).
- **AI voice agent (Deepgram → OpenAI → VEXYL-TTS, `AGENT_MODE=ai_voice`):** [ai-voice-agent.md](ai-voice-agent.md).
- **Ops sanity checks (readiness, recovery loops):** [stability.md](stability.md), [deployment.md](deployment.md).

### Rules for agents (project conventions)

- **Do not scatter `process.env`:** add/validate env vars in [`backend/src/config/env.ts`](../backend/src/config/env.ts) and import from there.
- **Keep layers clean:** controllers stay thin; business rules go in services; Mongo queries in repositories (see [backend-folder-structure.md](backend-folder-structure.md)).
- **Call correlation rule:** outbound API creates `Call` first; `KullooCallId` must survive SIP so ESL can attach FS UUID to that row (see [outbound-calls.md](outbound-calls.md)).
- **ESL rule:** media control for the hello flow is owned by the outbound ESL socket handler (see [esl.md](esl.md)).

### Human quickstart (minimal)

- **Deploy:** [deployment.md](deployment.md) → [`Docker/README.md`](../Docker/README.md)
- **Local:** [local-development.md](local-development.md)
- **Hello contract:** [hello-call-contract.md](hello-call-contract.md)

In the markdown files below this README, **relative links** are from each file’s own directory unless the text says otherwise.

---

## Deployment

| Document | Description |
|----------|-------------|
| [deployment.md](deployment.md) | **Server deployment**: Docker production quick start, checklist, links to Compose and telephony docs. |

## Local development

| Document | Description |
|----------|-------------|
| [local-development.md](local-development.md) | Local stack quickstart (API-only vs full telephony), common pitfalls. |

## Stability and operations

| Document | Description |
|----------|-------------|
| [stability.md](stability.md) | Reliability notes: idempotency, recovery loops, symptom→cause debugging. |

## Product and contracts

| Document | Description |
|----------|-------------|
| [hello-call-contract.md](hello-call-contract.md) | Hello-call API, recording contract, acceptance-style notes. |
| [ai-voice-agent.md](ai-voice-agent.md) | **AI voice agent** (`AGENT_MODE=ai_voice`): Deepgram, OpenAI, VEXYL-TTS, ESL loop, env vars, code map, persistence. |

## Backend codebase

| Document | Description |
|----------|-------------|
| [repository-root-map.md](repository-root-map.md) | Repo-root map: what each top-level folder/file is for (AI-friendly; links to backend doc). |
| [backend-folder-structure.md](backend-folder-structure.md) | Full `backend/` tree and contributor rules for new code. |

## Flows

| Document | Description |
|----------|-------------|
| [flows.md](flows.md) | Flow hub: Flow A (default Kamailio) vs Flow B (Drachtio). |
| [flow-a-kamailio.md](flow-a-kamailio.md) | Default signaling edge: Kamailio → FreeSWITCH → ESL. |
| [flow-b-drachtio.md](flow-b-drachtio.md) | Opt-in signaling edge: Drachtio → FreeSWITCH → ESL. |

## Telephony and data flow

| Document | Description |
|----------|-------------|
| [kamailio.md](kamailio.md) | **Kamailio SIP load balancer**: architecture, modules, KullooCallId flow, port plan, RTP ranges. |
| [inbound-call-dataflow.md](inbound-call-dataflow.md) | Inbound: Plivo Answer URL → Kamailio → FreeSWITCH pool → ESL → Mongo. |
| [outbound-calls.md](outbound-calls.md) | Outbound: API → Plivo → Kamailio → FreeSWITCH pool → ESL, `KullooCallId`. |
| [esl.md](esl.md) | Event Socket: FreeSWITCH connects to Kulloo (outbound ESL pattern, multi-instance). |
| [freeswitch.md](freeswitch.md) | FreeSWITCH config layout, multi-instance (fs1/fs2), SIP port 5070, Docker notes. |
| [webrtc-agent-softphone.md](webrtc-agent-softphone.md) | **WebRTC Softphone**: Agent connectivity (sip.js WSS listener, `/ws/agent`, and API bridging). |
| [drachtio.md](drachtio.md) | Flow B: Drachtio SIP edge (replaces Kamailio). |

## Planning (roadmaps)

| Location | Description |
|----------|-------------|
| [`.cursor/plans/`](../.cursor/plans/README.md) | Long-form design docs (e.g. AI voice pipeline roadmap). **Implementation** status: [ai-voice-agent.md](ai-voice-agent.md). |

## Reference

| Document | Description |
|----------|-------------|
| [api.md](api.md) | HTTP routes overview (health, calls, callbacks, recordings). |
| [redis.md](redis.md) | Redis keys, TTLs, idempotency cache, webhook dedupe, health. |
| [recordings-storage.md](recordings-storage.md) | Local WAV + optional S3 offload. |

---

*Operational runbooks (beyond [deployment.md](deployment.md)) may expand under `doc/` or an `operations/` folder later.*
