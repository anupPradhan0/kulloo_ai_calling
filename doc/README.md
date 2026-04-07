# Kulloo documentation

This folder is the **main narrative** for the Kulloo project. It is meant for **people** onboarding or designing features and for **AI assistants** that need accurate architecture and file-placement rules without scanning the whole repository.

---

## What is Kulloo?

Kulloo is a **TypeScript/Node calling backend**: an **Express** API, **MongoDB** as the system of record for calls, events, and recordings, and **Redis** (required) for idempotency caching and recording-webhook deduplication. **FreeSWITCH** handles SIP/RTP and media; Kulloo runs an **ESL** (Event Socket) TCP server so FreeSWITCH can connect in and run the scripted “hello” flow (answer, tone, record, DTMF, hangup). **Outbound** calls are often placed via **Plivo** (or other adapters); a stable **`KullooCallId`** links the HTTP-created `Call` document to the media leg on FreeSWITCH.

---

## Repository map (outside `doc/`)

| Path | Role |
|------|------|
| [`backend/`](../backend/) | Main API package — layout and conventions: [backend/backend-folder-structure.md](backend/backend-folder-structure.md). |
| [`freeswitch/`](../freeswitch/) | Checked-in FreeSWITCH configuration (dialplan, modules, vars). |
| [`Docker/`](../Docker/) | **Production Docker**: [`docker-compose.yml`](../Docker/docker-compose.yml) (default Kamailio stack), [`docker-compose.drachtio.yml`](../Docker/docker-compose.drachtio.yml) (Flow B overlay), deploy guide ([Docker/README.md](../Docker/README.md)). |
| Root `docker-compose*.yml` | Example stacks for API, Redis, Mongo, FreeSWITCH / server + Kamailio (alternate to `Docker/`). |

**Server deployment (operators):** [deployment.md](deployment.md) — quick path to production Compose and checklist; deep detail in [`Docker/README.md`](../Docker/README.md).

Local run instructions for the API: [`backend/README.md`](../backend/README.md).

---

## How to use this documentation

### For humans

1. Read **What is Kulloo** (above), then skim [product/requirements.md](product/requirements.md) if you care about vision and scope.  
2. To **deploy on a VPS** with Docker, start at [deployment.md](deployment.md), then follow [Docker/README.md](../Docker/README.md) as needed.  
3. For the concrete hello/recording behavior, read [product/hello-call-contract.md](product/hello-call-contract.md).  
4. For telephony, follow what you are changing: [telephony/outbound-calls.md](telephony/outbound-calls.md) (API → Plivo → FS → ESL), [telephony/inbound-call-dataflow.md](telephony/inbound-call-dataflow.md) (DID/SIP → FS → ESL), then [telephony/esl.md](telephony/esl.md) and [telephony/freeswitch.md](telephony/freeswitch.md) as needed.  
5. Keep [reference/api.md](reference/api.md) and [reference/redis.md](reference/redis.md) open for HTTP surface and Redis behavior.  
6. When editing code, use [backend/backend-folder-structure.md](backend/backend-folder-structure.md) so new files land in the right layer (controller vs service vs repository).

### For AI / coding agents

- **Where files go:** [backend/backend-folder-structure.md](backend/backend-folder-structure.md) — start with the section **“Where to put new code”**.  
- **HTTP routes:** [reference/api.md](reference/api.md).  
- **Redis, env vars:** [reference/redis.md](reference/redis.md); extend [`backend/src/config/env.ts`](../backend/src/config/env.ts) instead of scattering `process.env`.  
- **Call lifecycle and IDs:** [telephony/outbound-calls.md](telephony/outbound-calls.md), [telephony/inbound-call-dataflow.md](telephony/inbound-call-dataflow.md), [telephony/esl.md](telephony/esl.md).  
- **Deploying:** [deployment.md](deployment.md), [Docker/README.md](../Docker/README.md).  
- **Do not assume** a full operations runbook exists beyond deployment notes above.

In the markdown files below this README, **relative links** are from each file’s own directory unless the text says otherwise.

---

## Deployment

| Document | Description |
|----------|-------------|
| [deployment.md](deployment.md) | **Server deployment**: Docker production quick start, checklist, links to Compose and telephony docs. |

## Product and contracts

| Document | Description |
|----------|-------------|
| [product/requirements.md](product/requirements.md) | Platform vision, scope, phases, high-level data model (CPaaS-style reference patterns). |
| [product/hello-call-contract.md](product/hello-call-contract.md) | Hello-call API, recording contract, acceptance-style notes. |

## Backend codebase

| Document | Description |
|----------|-------------|
| [backend/backend-folder-structure.md](backend/backend-folder-structure.md) | Full `backend/` tree and contributor rules for new code. |

## Telephony and data flow

| Document | Description |
|----------|-------------|
| [telephony/kamailio.md](telephony/kamailio.md) | **Kamailio SIP load balancer**: architecture, modules, KullooCallId flow, port plan, RTP ranges. |
| [telephony/inbound-call-dataflow.md](telephony/inbound-call-dataflow.md) | Inbound: Plivo Answer URL → Kamailio → FreeSWITCH pool → ESL → Mongo. |
| [telephony/outbound-calls.md](telephony/outbound-calls.md) | Outbound: API → Plivo → Kamailio → FreeSWITCH pool → ESL, `KullooCallId`. |
| [telephony/esl.md](telephony/esl.md) | Event Socket: FreeSWITCH connects to Kulloo (outbound ESL pattern, multi-instance). |
| [telephony/freeswitch.md](telephony/freeswitch.md) | FreeSWITCH config layout, multi-instance (fs1/fs2), SIP port 5070, Docker notes. |

## Reference

| Document | Description |
|----------|-------------|
| [reference/api.md](reference/api.md) | HTTP routes overview (health, calls, callbacks, recordings). |
| [reference/redis.md](reference/redis.md) | Redis keys, TTLs, idempotency cache, webhook dedupe, health. |

---

*Operational runbooks (beyond [deployment.md](deployment.md)) may expand under `doc/` or an `operations/` folder later.*
