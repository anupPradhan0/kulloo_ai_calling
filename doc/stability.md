# Stability and operations notes (Kulloo)

> **Doc hub:** [Documentation index](README.md) — call-flow docs and API reference are sibling files in this folder.

This page is a practical “keep it running” reference: **failure modes**, **recovery mechanisms**, **idempotency**, and a short **debug checklist** that maps symptoms to the most likely layer (HTTP, Redis, Mongo, SIP, FreeSWITCH, ESL).

---

## 1. What “stable” means for Kulloo right now

Kulloo is stable when:

- **Calls converge to a terminal status** (`completed` or `failed`) even if the backend restarts mid-call.
- **Provider retries** (recording callbacks, repeated outbound requests) do **not** create duplicate side effects.
- **Recordings are consistent**: a `Recording` document exists and points to a WAV file that is non-empty (or status is explicitly `failed`).
- **Health endpoints reflect reality** (Mongo + Redis reachability, not just “process is alive”).

---

## 2. Process health: liveness vs readiness

From the API:

- `GET /api/health/live`
  - Liveness probe: process responds.
- `GET /api/health`
  - Readiness probe: checks **Mongo ping** and **Redis `PING`**.

**Redis is required.** If `REDIS_URL` is missing or Redis is unreachable at startup, Kulloo exits instead of starting a “half-working” process. Details: [redis.md](redis.md).

---

## 3. Idempotency and duplicate delivery (what is safe)

### 3.1 Outbound call create idempotency

`POST /api/calls/outbound/hello` requires `Idempotency-Key`.

- **Mongo is authoritative**: unique index on `idempotencyKey` prevents duplicates.
- **Redis accelerates repeats**: hashed key → cached Mongo `Call._id` avoids extra Mongo read and makes repeated requests fast.

If Redis is cold/evicted, idempotency still holds because Mongo enforces it.

### 3.2 Recording callback dedupe

Provider callbacks under `POST /api/calls/callbacks/*/recording` are deduped with Redis (`SET ... NX` + TTL). Retries receive **HTTP 200** with `{ duplicate: true }` so providers stop retrying.

---

## 4. Recovery loops (eventual consistency)

Kulloo starts two background mechanisms (see `backend/src/services/recovery/`):

- **Orphan call sweep**
  - Purpose: mark calls that never reached a terminal state (e.g. backend restarted mid-flow).
  - Typical symptom fixed: “calls stuck in `connected` / `answered` forever”.
- **Recordings sync**
  - Purpose: reconcile WAV files on disk with Mongo `Recording` documents (backfill missing rows, update status when possible).
  - Typical symptom fixed: “WAV exists on disk, but API `/api/recordings` does not show it”.

These are safety nets; they do not replace fixing the underlying cause (ports, mounts, or FS → ESL connectivity).

---

## 5. Common failures: symptom → most likely cause

### 5.1 `GET /api/health` returns 503

- Mongo down / wrong `MONGODB_URI`
- Redis down / wrong `REDIS_URL` (**required**)

### 5.2 Outbound API returns 200 but call stays `connected` forever

Normal for the Plivo path until the media leg runs. If it stays there:

- FreeSWITCH never reached Kulloo ESL listener (`ESL_OUTBOUND_PORT`)
- Dialplan `socket` target wrong host:port
- Firewall blocks TCP to `ESL_OUTBOUND_PORT`

See: [esl.md](esl.md), [freeswitch.md](freeswitch.md).

### 5.3 “No audio” / silent call

- FreeSWITCH SDP advertises a private IP; set `external_sip_ip` / `ext-rtp-ip` to the server public IP in `vars.fs*.xml`.
- RTP UDP range blocked by firewall.

See: [kamailio.md](kamailio.md), [freeswitch.md](freeswitch.md).

### 5.4 Recording exists but is empty / very small

- Recording stopped too early or FS couldn’t write to `RECORDINGS_DIR`.
- Backend and FS not sharing the same recordings volume/path.

### 5.5 Recording is not playable immediately after hangup

If you click play immediately after a call ends, the recording may still be transitioning:

- `status: uploading`: the API will still serve the **local** WAV (if `filePath` exists) until S3 upload completes.
- `status: completed` + S3 metadata present: `GET /api/recordings/:recordingId/file` will **302 redirect** to a pre-signed S3 URL.

If S3 upload failed, status becomes `failed` and the local WAV is intentionally kept (if present) to allow manual recovery.

### 5.5 Duplicate call rows or duplicate callback ingestion

- Ensure `Idempotency-Key` is always set for outbound create.
- Ensure `REDIS_URL` points to a single shared Redis for the API instances handling callbacks.

---

## 6. Minimal on-call debug checklist (fast path)

- **HTTP**: check `GET /api/health` and `GET /api/metrics`.
- **Redis**: verify `PING` from the API environment (container/host).
- **Mongo**: verify connectivity and that calls/events are being written.
- **SIP**: confirm INVITEs reach Kamailio/FreeSWITCH/Drachtio.
- **ESL outbound**: confirm FreeSWITCH can open TCP to `ESL_OUTBOUND_PORT` and the hello `socket` step runs.
- **Recordings**: confirm the WAV directory is a shared mount between FS and backend.

---

## 7. Related docs

- [outbound-calls.md](outbound-calls.md)
- [inbound-call-dataflow.md](inbound-call-dataflow.md)
- [esl.md](esl.md)
- [freeswitch.md](freeswitch.md)
- [redis.md](redis.md)
- [api.md](api.md)

