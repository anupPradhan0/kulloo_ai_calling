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

**Server deployment (operators):** [ops/deployment.md](ops/deployment.md) — quick path to production Compose and checklist; deep detail in [`Docker/README.md`](../Docker/README.md).

Local run instructions for the API: [`backend/README.md`](../backend/README.md).

---

## How to use this documentation (AI-first)

This `doc/` folder is intended to be **AI-friendly**: it should let an agent answer architecture questions and place new code correctly **without scanning the full repository**.

### AI quickstart (keep these open)

- **Where files go (source of truth):** [backend/backend-folder-structure.md](backend/backend-folder-structure.md) — start at **“Where to put new code”**.
- **HTTP surface (routes + callbacks):** [reference/api.md](reference/api.md).
- **Redis is required (keys/TTLs + why):** [reference/redis.md](reference/redis.md).
- **Call lifecycles + correlation:** [telephony/outbound-calls.md](telephony/outbound-calls.md), [telephony/inbound-call-dataflow.md](telephony/inbound-call-dataflow.md), [telephony/esl.md](telephony/esl.md).
- **Which signaling edge is active (Flow A vs Flow B):** [telephony/flows/README.md](telephony/flows/README.md).
- **Ops sanity checks (readiness, recovery loops):** [ops/stability.md](ops/stability.md), [ops/deployment.md](ops/deployment.md).

### Rules for agents (project conventions)

- **Do not scatter `process.env`:** add/validate env vars in [`backend/src/config/env.ts`](../backend/src/config/env.ts) and import from there.
- **Keep layers clean:** controllers stay thin; business rules go in services; Mongo queries in repositories (see [backend/backend-folder-structure.md](backend/backend-folder-structure.md)).
- **Call correlation rule:** outbound API creates `Call` first; `KullooCallId` must survive SIP so ESL can attach FS UUID to that row (see [telephony/outbound-calls.md](telephony/outbound-calls.md)).
- **ESL rule:** media control for the hello flow is owned by the outbound ESL socket handler (see [telephony/esl.md](telephony/esl.md)).

### Human quickstart (minimal)

- **Deploy:** [ops/deployment.md](ops/deployment.md) → [`Docker/README.md`](../Docker/README.md)
- **Local:** [ops/local-development.md](ops/local-development.md)
- **Hello contract:** [product/hello-call-contract.md](product/hello-call-contract.md)

In the markdown files below this README, **relative links** are from each file’s own directory unless the text says otherwise.

---

## Deployment

| Document | Description |
|----------|-------------|
| [ops/deployment.md](ops/deployment.md) | **Server deployment**: Docker production quick start, checklist, links to Compose and telephony docs. |

## Local development

| Document | Description |
|----------|-------------|
| [ops/local-development.md](ops/local-development.md) | Local stack quickstart (API-only vs full telephony), common pitfalls. |

## Stability and operations

| Document | Description |
|----------|-------------|
| [ops/stability.md](ops/stability.md) | Reliability notes: idempotency, recovery loops, symptom→cause debugging. |

## Product and contracts

| Document | Description |
|----------|-------------|
| [product/requirements.md](product/requirements.md) | Platform vision, scope, phases, high-level data model (CPaaS-style reference patterns). |
| [product/hello-call-contract.md](product/hello-call-contract.md) | Hello-call API, recording contract, acceptance-style notes. |

## Backend codebase

| Document | Description |
|----------|-------------|
| [repository-root-map.md](repository-root-map.md) | Repo-root map: what each top-level folder/file is for (AI-friendly; links to backend doc). |
| [backend/backend-folder-structure.md](backend/backend-folder-structure.md) | Full `backend/` tree and contributor rules for new code. |

## Flows

| Document | Description |
|----------|-------------|
| [telephony/flows/README.md](telephony/flows/README.md) | Flow hub: Flow A (default Kamailio) vs Flow B (Drachtio). |
| [telephony/flows/flow-a-kamailio.md](telephony/flows/flow-a-kamailio.md) | Default signaling edge: Kamailio → FreeSWITCH → ESL. |
| [telephony/flows/flow-b-drachtio.md](telephony/flows/flow-b-drachtio.md) | Opt-in signaling edge: Drachtio → FreeSWITCH → ESL. |

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

*Operational runbooks (beyond [ops/deployment.md](ops/deployment.md)) may expand under `doc/` or an `operations/` folder later.*
