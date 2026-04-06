# Kulloo — Docker deployment

This folder holds **production-oriented Compose files** (paths relative to `Docker/`) and **step-by-step deployment** guidance. The Kulloo repo also keeps Compose files at the **repository root** (`docker-compose.server.yml`, `docker-compose.kamailio.yml`, …) for backward compatibility; both layouts are described below.

---

## What gets deployed (production)

| Service | Image / build | Role |
|---------|----------------|------|
| **api** | `../backend` Dockerfile `production` | Express API + ESL TCP **3200** |
| **mongodb** | `mongo:7` | Call/event/recording data |
| **redis** | `redis:7-alpine` | Idempotency + webhook dedupe |
| **fs1**, **fs2** | `signalwire/freeswitch:v1.10` | SIP media, **hello** dialplan → ESL |
| **kamailio** | `kamailio/kamailio:5.7-alpine` | SIP **5060** → dispatcher → FS pool |

**Call path (Plivo):** Plivo SIP → **Kamailio:5060** → **fs1:5070** or **fs2:5070** (container) → **`socket` → `api:3200` (ESL)** → Mongo/Redis.

**RTP:** Stays on **FreeSWITCH** (non-overlapping UDP ranges per FS). See `doc/telephony/kamailio.md`.

---

## Prerequisites

- **Docker** and **Docker Compose** v2 (`docker compose`).
- A **VPS** (or bare metal) with a **static public IPv4** for SIP/RTP advertisement.
- **Firewall:** allow **TCP/UDP 5060** (Kamailio), **UDP+TCP 5070–5071** (FS host SIP, if tested directly), **UDP RTP ranges** for each FS (`16384–17383`, `17384–18383` with default vars), **TCP 5000** (HTTP API), **TCP 3200** (ESL from FS to API — often same host as 5000). Lock MongoDB/Redis to localhost in production compose (already `127.0.0.1`).

---

## One-time setup on the server

1. **Clone** the repository:

   ```bash
   git clone <your-repo-url> kulloo
   cd kulloo
   ```

2. **Environment file** at **repository root** (parent of `Docker/`):

   ```bash
   cp backend/.env.example .env
   ```

   Edit **`.env`** minimally for Docker production:

   - `MONGODB_URI=mongodb://mongodb:27017/sip-backend` (already overridden in compose for `api`; root `.env` can still set secrets)
   - `REDIS_URL=redis://redis:6379`
   - `RECORDINGS_DIR=/recordings`
   - `ESL_OUTBOUND_PORT=3200`
   - **`KAMAILIO_SIP_URI`** = `sip:1000@YOUR_PUBLIC_IP` (what Plivo dials; **not** Docker-only `kamailio` unless your carrier reaches internal DNS)
   - `PUBLIC_BASE_URL`, `PLIVO_*`, etc. — see `backend/.env.example` and `doc/reference/api.md`

3. **FreeSWCONFIG:** Edit **`freeswitch/conf/vars.fs1.xml`** and **`vars.fs2.xml`**: set **`external_sip_ip`** (and domain if used) to your **public** IP. Wrong RTP/SDP IP → one-way or no audio.

4. **Kamailio advertise (optional but often required behind NAT):** Set **`KAMAILIO_ADVERTISE_ADDRESS`** at **container start** to your public IP. The stock `kamailio/kamailio.cfg` documents `#!ifdef KAMAILIO_ADVERTISE_ADDRESS`. See `kamailio/README.md` for the one-line deploy note. You can extend `docker-compose.prod.yml` with `environment` or a tiny wrapper image if you need compile-time defines.

---

## Production — recommended (single Compose file)

Run from **repository root** so `../` paths inside `Docker/docker-compose.prod.yml` resolve correctly:

```bash
cd /path/to/kulloo

docker compose -f Docker/docker-compose.prod.yml build
docker compose -f Docker/docker-compose.prod.yml up -d
```

Check:

```bash
docker compose -f Docker/docker-compose.prod.yml ps
curl -sS http://127.0.0.1:5000/api/health
docker exec kulloo-kamailio kamctl dispatcher show
```

**Logs:**

```bash
docker compose -f Docker/docker-compose.prod.yml logs -f api
docker logs kulloo-kamailio --tail 100 -f
```

**Stop / remove containers (keep volumes):**

```bash
docker compose -f Docker/docker-compose.prod.yml down
```

**Stop and delete volumes (destructive):**

```bash
docker compose -f Docker/docker-compose.prod.yml down -v
```

---

## Production — legacy two-file layout (repository root)

Equivalent stack using root files (creates **`kulloo_net`** first, then attaches Kamailio):

```bash
cd /path/to/kulloo

docker compose -f docker-compose.server.yml up -d --build
docker compose -f docker-compose.kamailio.yml up -d
```

Root compose uses **`./backend`**, **`./freeswitch`**, **`./kamailio`** paths. The Kamailio overlay expects network **`kulloo_net`** to exist (created by `docker-compose.server.yml`).

---

## Local development dependencies only

Mongo + Redis + **one** FreeSWITCH (MRF image), API runs on laptop via `pnpm dev`:

```bash
docker compose -f Docker/docker-compose.dev.yml up -d
mkdir -p recordings   # if you use ../recordings mount
```

Point **`backend/.env`** at `localhost` for Mongo/Redis and match ESL/FS to your machine.

**Redis alone:**

```bash
docker compose -f Docker/docker-compose.redis-only.yml up -d
```

---

## Files in this directory

| File | Purpose |
|------|---------|
| **`docker-compose.prod.yml`** | Full production: API, Mongo, Redis, fs1, fs2, Kamailio, shared volumes |
| **`docker-compose.dev.yml`** | Mongo + Redis + single FS for host-based API dev |
| **`docker-compose.redis-only.yml`** | Standalone Redis |
| **`DEPLOYMENT-REFERENCE.md`** | Extra context: Kulloo Docker vs typical multi-service CPaaS stacks |
| **`README.md`** | This guide |

Root-level **`docker-compose.yml`**, **`docker-compose.server.yml`**, **`docker-compose.kamailio.yml`**, **`docker-compose.freeswitch.yml`**, **`docker-compose.redis.yml`** remain the historical / alternate entry points; see comments inside those files.

---

## Health and operations

- API: `GET /api/health`, `GET /api/health/` (readiness).
- Kamailio dispatcher: `docker exec kulloo-kamailio kamctl dispatcher show`
- Reload dispatcher list after edits: `docker exec kulloo-kamailio kamctl dispatcher reload`

---

## Troubleshooting (short)

| Symptom | Check |
|--------|--------|
| **503** from carrier | `kamctl dispatcher show` — FS targets active? FS reachable on **5070** from Kamailio container? |
| No audio | **`external_sip_ip`** in **`vars.fs*.xml`**; firewall **UDP** RTP ranges; Plivo IP allowlist |
| ESL not attaching | **`kulloo_esl_host=api`** in vars; **`api`** resolves on **`kulloo_net`**; port **3200** published |
| Duplicate inbound Calls | **`KullooCallId`** must survive Kamailio (see `doc/telephony/kamailio.md`) |

More detail: **`doc/README.md`**, **`doc/telephony/kamailio.md`**, **`doc/telephony/freeswitch.md`**, **`kamailio/README.md`**.
