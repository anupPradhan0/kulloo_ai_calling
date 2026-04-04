# Kulloo documentation

Docs are grouped by topic. Paths below are relative to this `doc/` folder.

## Product & contracts

| Document | Description |
|----------|-------------|
| [product/reqremeant.md](product/reqremeant.md) | Platform vision, scope, phases, data model (high level). |
| [product/hello-call-contract.md](product/hello-call-contract.md) | Hello-call API and recording contract, acceptance criteria. |

## Backend codebase

| Document | Description |
|----------|-------------|
| [backend/backend-folder-structure.md](backend/backend-folder-structure.md) | Every folder/file under `backend/`, where to add new code. |

## Telephony & data flow

| Document | Description |
|----------|-------------|
| [telephony/inbound-call-dataflow.md](telephony/inbound-call-dataflow.md) | Inbound Plivo → FreeSWITCH → ESL → Mongo. |
| [telephony/outbound-calls.md](telephony/outbound-calls.md) | Outbound API → Plivo → FS → ESL, `KullooCallId`. |
| [telephony/esl.md](telephony/esl.md) | Event Socket (outbound from FS to Kulloo). |
| [telephony/freeswitch.md](telephony/freeswitch.md) | FreeSWITCH config, dialplan, Docker notes. |

## Reference

| Document | Description |
|----------|-------------|
| [reference/api.md](reference/api.md) | HTTP routes overview. |
| [reference/redis.md](reference/redis.md) | Redis (idempotency cache, webhook dedupe, health). |

---

*Operational notes such as `stability.md` may be added at the `doc/` root or under a future `operations/` folder.*
