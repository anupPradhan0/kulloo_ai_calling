# Recording storage (local + S3) in Kulloo

> **Doc hub:** [Documentation index](README.md) — API surface: [api.md](api.md); ESL / FreeSWITCH: [esl.md](esl.md), [freeswitch.md](freeswitch.md).

Kulloo always produces recordings as **local WAV files** via FreeSWITCH + ESL. Optionally, it can **upload finalized WAVs to S3** and serve playback via **pre-signed URLs**.

---

## 1. Recording lifecycle statuses

Mongo `Recording.status` values used by the FreeSWITCH path:

- **`pending`**: recording started (legacy default; kept for existing rows)
- **`recorded`**: local WAV finalized and validated (non-empty)
- **`uploading`**: S3 upload in progress
- **`completed`**: available for playback (S3 upload done, or local-only completion)
- **`failed`**: recording or upload failed (local file is kept if present)

---

## 2. S3 configuration (environment)

S3 is enabled when **both** `S3_BUCKET` and `S3_REGION` are set.

| Variable | Required | Meaning |
|----------|----------|---------|
| `S3_REGION` | Yes (for S3) | AWS region (e.g. `us-east-1`) |
| `S3_BUCKET` | Yes (for S3) | Bucket name |
| `S3_PREFIX` | No | Optional prefix inside the bucket (no leading/trailing slashes) |
| `S3_PRESIGN_TTL_SEC` | No | Pre-signed URL TTL in seconds (default **300**) |

---

## 3. S3 object key scheme (partitioning)

Uploads use a date-partitioned key to keep S3 listings and lifecycle policies efficient:

`recordings/YYYY/MM/DD/{callUuid}.wav`

If `S3_PREFIX` is set, it prefixes the key (e.g. `prod/recordings/...`).

---

## 4. Playback behavior (`GET /api/recordings/:recordingId/file`)

- If the recording is **completed in S3** (has `s3Bucket`/`s3Key`/`s3Region` and `status === "completed"`), the API responds with **HTTP 302** redirecting to a **pre-signed S3 URL**.
- Otherwise, if `filePath` exists, the API streams the **local WAV** (this covers the “race” window while status is `uploading`).

---

## 5. Source of truth in code

| Topic | Path |
|------|------|
| Env vars | `backend/src/config/env.ts` |
| S3 helpers (upload, presign, key building) | `backend/src/services/storage/s3.service.ts` |
| Recording schema (statuses + S3 metadata) | `backend/src/modules/calls/models/recording.model.ts` |
| Upload trigger + local delete on success | `backend/src/services/freeswitch/esl-call-handler.service.ts` |
| Serving file vs redirect | `backend/src/modules/calls/controllers/call.controller.ts` |

