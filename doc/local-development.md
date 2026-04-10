# Local development quickstart (Kulloo)

> **Doc hub:** [Documentation index](../README.md) — deployment is in [deployment.md](deployment.md).

This page is for getting a working local stack fast (API + Mongo + Redis, and optionally FreeSWITCH/Kamailio via Compose) and for the most common “why is nothing happening” issues.

---

## 1. What you can run locally

| Mode | What you get | When to use |
|------|--------------|-------------|
| **API-only** | Express API + Mongo + Redis | Working on HTTP routes, persistence, idempotency, callbacks |
| **Full telephony (Docker)** | API + Mongo + Redis + FreeSWITCH (+ Kamailio) | Working on call flows, ESL, recordings, SIP/RTP |

If you’re only iterating on API logic, start with **API-only**.

---

## 2. API-only (fastest)

From the repo root:

1. Create env:

```bash
cp backend/.env.example .env
```

2. Start Mongo + Redis (one option is the repo’s compose files; exact file names vary by workflow):

```bash
docker compose up -d mongo redis
```

3. Run the backend locally:

- Follow `backend/README.md` for install/run.
- Health:

```bash
curl -sS http://127.0.0.1:5000/api/health
```

If readiness is **503**, fix `MONGODB_URI` / `REDIS_URL` first (Redis is required).

---

## 3. Full telephony stack (Docker)

The repo contains both root compose examples and a production-oriented set under `Docker/`.

- Recommended path to start: [deployment.md](deployment.md) (even for local Docker, it points to the authoritative Compose docs).
- Telephony details: [../telephony/outbound-calls.md](../telephony/outbound-calls.md), [../telephony/inbound-call-dataflow.md](../telephony/inbound-call-dataflow.md).

Key things to align:

- **`ESL_OUTBOUND_PORT`**: Kulloo listens here (default `3200`).
- **FreeSWITCH dialplan**: must `socket` to the Kulloo host:port (reachable from the FS container).
- **Recordings volume**: backend and FS must share the same `RECORDINGS_DIR` mount.

---

## 4. Quick smoke checks

### 4.1 Health

- `GET /api/health/live` should be 200 when the process is up.
- `GET /api/health` should be 200 only when **Mongo + Redis** are reachable.

### 4.2 Metrics

`GET /api/metrics` should return counters (including Redis and ESL-related metrics once exercised).

### 4.3 Local recordings endpoints

- `GET /api/recordings/local` should list WAV files if the backend can see the recordings directory.

---

## 5. Common local issues

| Symptom | Likely cause | Fix |
|--------|--------------|-----|
| API exits at startup | Redis missing/unreachable | Set `REDIS_URL` and start Redis; see [../reference/redis.md](../reference/redis.md) |
| `GET /api/health` is 503 | Mongo or Redis down | Fix `MONGODB_URI` / `REDIS_URL` |
| Calls never progress beyond `connected` | FS can’t reach Kulloo `ESL_OUTBOUND_PORT` | Fix dialplan `socket` host:port, networking, firewall |
| No recordings visible via API | FS and backend don’t share `RECORDINGS_DIR` | Use a shared volume/mount |
| Silent calls | Wrong FS advertised IP / RTP ports blocked | Set `external_sip_ip` / `ext-rtp-ip` and open RTP ranges |

---

## 6. Related docs

- [deployment.md](deployment.md)
- [stability.md](stability.md)
- [../reference/api.md](../reference/api.md)
- [../reference/redis.md](../reference/redis.md)
- [../telephony/esl.md](../telephony/esl.md)

