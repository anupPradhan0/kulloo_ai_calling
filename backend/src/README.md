# `backend/src` layout (humans and AI)

Runtime source for the Kulloo API. **Narrative docs:** [`../../doc/README.md`](../../doc/README.md). **Every path under `backend/`:** [`../../doc/backend/backend-folder-structure.md`](../../doc/backend/backend-folder-structure.md).

## HTTP request path

1. **`app.ts`** — Builds the Express app: middleware, **correlation id**, **Plivo Answer/Hangup on the app root** (not only `/api`), then **`/api` → `routes/index.ts`**.
2. **`routes/index.ts`** — Mounts `/api/health`, `/api/metrics`, `/api/users`, `/api/calls`, `/api/recordings`.
3. **`modules/<feature>/routes/*.ts`** — Maps paths to controller functions.
4. **`modules/<feature>/controllers/*.ts`** — Validates input (often Zod), calls **services**, sends JSON. **No direct Mongoose calls.**
5. **`modules/<feature>/services/*.ts`** — Business rules and orchestration; calls **repositories** and **adapters**.
6. **`modules/<feature>/repositories/*.ts`** — Database access (Mongoose).
7. **`modules/<feature>/models/*.ts`** — Schemas and `model()`.

## Telephony path (parallel to HTTP)

1. **`server.ts`** — Process bootstrap: Mongo → **Redis must answer PING** → **ESL TCP server** → orphan + recordings sync timers → HTTP listen.
2. **`services/freeswitch/esl-call-handler.service.ts`** — Listens on **`ESL_OUTBOUND_PORT`**. FreeSWITCH dialplan **`socket`** connects **into** Node (outbound-ESL pattern). Runs the hello media script and persists through **`CallService`** (same domain layer as HTTP).

## Cross-cutting directories

| Directory | Role |
|-----------|------|
| **`config/`** | `env.ts` — **all** environment variables (do not read `process.env` elsewhere). `database.ts` — mongoose connect. |
| **`middlewares/`** | Global Express: `correlationId`, centralized errors. |
| **`services/redis/`** | Shared client, idempotency cache, webhook dedupe. |
| **`services/recovery/`** | Orphan non-terminal calls after restarts; sync WAV files on disk into Mongo. |
| **`services/health/`** | Readiness helpers (Mongo/Redis); HTTP surface in `modules/health/`. |
| **`services/observability/`** | In-memory metrics; exposed at `/api/metrics`. |
| **`utils/`** | Logger, `ApiError`, Zod helper, phone normalize, Plivo payload helpers. |
| **`types/`** | Ambient `.d.ts` (e.g. Express `correlationId` on `Request`). |

## Plivo vs `/api`

- **JSON REST** lives under **`/api/...`**.
- **Plivo XML Application** (Answer URL, Hangup) is registered on the **root** app in **`app.ts`** via **`modules/calls/routes/plivo.webhooks.ts`** (paths like `/plivo/answer` and `/api/plivo/answer`).

## Conventions for changes

- **New env var:** add to **`config/env.ts`** only, then import `env`.
- **New domain feature:** add **`modules/<name>/`** with routes → controllers → services → repositories → models as needed.
- **FreeSWITCH / ESL behavior:** **`services/freeswitch/`**; keep persistence on **`CallService`**, not ad-hoc repository use from ESL unless already the established pattern there.
