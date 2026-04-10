# Kulloo repository root map (AI-agent doc)

> **Doc hub:** [Documentation index](README.md)

Use this doc when you are an **AI coding agent** and you need to decide **where to edit** in the Kulloo repo root (`/home/mors/Code/kulloo`) without scanning the whole codebase.

> [!IMPORTANT]
> This doc intentionally does **not** list the internal `backend/` file tree.
> For backend file placement and the full backend inventory, use: **[backend-folder-structure.md](backend-folder-structure.md)**.

---

## TL;DR (routing)

If you need to change…

- **HTTP API / Mongo models / Redis logic / recordings endpoints** → start in `backend/` + **[api.md](api.md)** / **[redis.md](redis.md)**
- **Hello media behavior (answer/play/record/DTMF)** → `backend/` (ESL handler) + `freeswitch/` (dialplan trigger); read **[esl.md](esl.md)** + **[freeswitch.md](freeswitch.md)**
- **SIP edge Flow A (Kamailio)** → `kamailio/` + `Docker/`; read **[kamailio.md](kamailio.md)**
- **SIP edge Flow B (Drachtio)** → `backend/` + `Docker/`; read **[drachtio.md](drachtio.md)**
- **Ports/volumes/services in deployment** → `Docker/`; read **[deployment.md](deployment.md)**

---

## Source-of-truth vs generated output (AI rules)

- **Edit source, not build output**: prefer `backend/src/**` over `backend/dist/**` if you see both.
- **Docs are source-of-truth for intent**; code is source-of-truth for behavior.
- **Do not add env vars ad-hoc**: centralize in `backend/src/config/env.ts` (see `doc/README.md` for agent rules).

---

## Top-level directories (what each one owns)

### `.cursor/`

Cursor/editor metadata (rules, settings, tooling hints). Not part of runtime.

- **Use when**: you want to adjust Cursor rules or project-level editor configuration.
- **Avoid when**: changing production behavior.

### `Docker/`

Production-oriented Docker Compose entrypoint and deployment notes.

- **What lives here**:
  - `Docker/README.md`: how to run the production stacks
  - `Docker/docker-compose.yml`: **Flow A** (Kamailio) stack
  - `Docker/docker-compose.flow-b.yml`: **Flow B** (Drachtio) stack
- **Use when**: changing deployment wiring, ports, volumes, or which services run together.
- **Related docs**: [deployment.md](deployment.md), [flows.md](flows.md).

### `backend/`

The Node/Express API and all call persistence + ESL server code.

- **Use when**: changing HTTP routes, Mongo models, Redis behavior, ESL handler, providers, etc.
- **AI rule**: do not guess file locations—use **[backend-folder-structure.md](backend-folder-structure.md)**.

### `doc/`

AI-first documentation for architecture, flows, and file-placement rules.

- **Start here**: `doc/README.md`
- **Use when**: you need authoritative “how it works” without scanning code.

### `freeswitch/`

Checked-in FreeSWITCH configuration (`freeswitch/conf/**`) used by the Docker stacks.

- **What it’s for**: the hello dialplan and core FS settings (ports, context, vars).
- **Use when**: changing the dialplan trigger, SIP profile settings, or ESL socket target variables.
- **Related docs**: [freeswitch.md](freeswitch.md), [esl.md](esl.md).

### `frontend/`

Frontend UI (currently a Vite React + TypeScript template).

- **Use when**: building/admin UI for Kulloo (calls/recordings dashboards, etc.).
- **Note**: if `frontend/README.md` is still template text, treat it as placeholder until product-specific UI docs are added.

### `kamailio/`

Kamailio SIP proxy configuration for **Flow A** (default signaling edge).

- **What lives here**: `kamailio.cfg`, `dispatcher.list`, `README.md`.
- **Use when**: changing SIP routing/health checks/dispatcher pool in Flow A.
- **Related docs**: [kamailio.md](kamailio.md), [flow-a-kamailio.md](flow-a-kamailio.md).

---

## Key subfolders: important files and what they do

This section is **file-level** for the most important non-backend config folders.

### `freeswitch/conf/` (what each file is for)

| Path | What it’s for | When to edit |
|------|---------------|--------------|
| `freeswitch/conf/dialplan/hello.xml` | **Hello extension** in context `mrf`: matches `1000`/`hello` and runs `socket $${kulloo_esl_host}:$${kulloo_esl_port} async full` (FreeSWITCH → Kulloo outbound ESL). | When you want to change what destination triggers the hello flow or how the outbound ESL socket is invoked. |
| `freeswitch/conf/freeswitch.xml` | Main FreeSWITCH config: loads modules (sofia, dialplan XML, event socket server), defines SIP profiles and points them at the correct dialplan context (`mrf`). | When SIP profile/ports/modules/context wiring changes. |
| `freeswitch/conf/vars.xml` | Shared variables: codec prefs, RTP ranges defaults, and variables like `kulloo_esl_host`/`kulloo_esl_port` (may be overridden per instance). | When defaults change or you want to add a new global var used by dialplan/profiles. |
| `freeswitch/conf/vars.fs1.xml` | **Instance override** for fs1 (especially advertise/external IP and RTP range). | When fixing “no audio”/NAT or changing fs1 RTP allocation. |
| `freeswitch/conf/vars.fs2.xml` | **Instance override** for fs2 (especially advertise/external IP and RTP range). | When fixing “no audio”/NAT or changing fs2 RTP allocation. |

Related docs: [freeswitch.md](freeswitch.md), [esl.md](esl.md), [deployment.md](deployment.md).

### `kamailio/` (what each file is for)

| Path | What it’s for | When to edit |
|------|---------------|--------------|
| `kamailio/kamailio.cfg` | Kamailio routing logic: dispatcher-based load balancing, header pass-through, record-route intent, OPTIONS probing settings. | When SIP routing logic, failover behavior, or logging changes. |
| `kamailio/dispatcher.list` | Pool membership: which FreeSWITCH instances exist and how Kamailio routes to them. | When adding/removing FS instances or changing pool URIs. |
| `kamailio/README.md` | Human/operator notes for running and checking dispatcher state. | When operational instructions change. |

Related docs: [kamailio.md](kamailio.md), [flow-a-kamailio.md](flow-a-kamailio.md).

### `Docker/` (what each file is for)

| Path | What it’s for | When to edit |
|------|---------------|--------------|
| `Docker/README.md` | Operator runbook for Docker deployments (Flow A vs Flow B, ports, env). | When deployment instructions change. |
| `Docker/docker-compose.yml` | **Flow A** stack: API + Mongo + Redis + FreeSWITCH pool + Kamailio. | When changing service wiring, ports, volumes, env injection. |
| `Docker/docker-compose.flow-b.yml` | **Flow B** stack: API + Mongo + Redis + FreeSWITCH + Drachtio (no Kamailio). | When changing Flow B deployment wiring. |

### `recordings/`

Local recordings directory (WAV files) used by dev/compose volumes.

- **Use when**: debugging “recordings not visible” issues; verifying shared mounts between FreeSWITCH and backend.
- **Related docs**: [api.md](api.md) (local recordings endpoints), [stability.md](stability.md).

---

## Top-level files

### `.dockerignore`

Controls what is sent to Docker builds.

- **Use when**: Docker build is slow or includes unwanted files.

### `.gitignore`

Git ignore rules for local/generated files.

- **Use when**: you’re accidentally committing build outputs, local env files, recordings, etc.

---

## Quick “where do I change X?” (AI routing table)

| You want to change… | Start in… | Then follow… |
|---------------------|-----------|--------------|
| HTTP route / request validation | `backend/` | [api.md](api.md), [backend-folder-structure.md](backend-folder-structure.md) |
| Redis idempotency / webhook dedupe | `backend/` | [redis.md](redis.md) |
| Hello media flow (answer/play/record/DTMF) | `backend/` + `freeswitch/` | [esl.md](esl.md), [freeswitch.md](freeswitch.md) |
| Flow A SIP load balancing (Kamailio) | `kamailio/` + `Docker/` | [kamailio.md](kamailio.md) |
| Flow B SIP signaling (Drachtio) | `backend/` + `Docker/` | [drachtio.md](drachtio.md), [flow-b-drachtio.md](flow-b-drachtio.md) |
| Deployment ports/volumes/services | `Docker/` | [deployment.md](deployment.md) |

