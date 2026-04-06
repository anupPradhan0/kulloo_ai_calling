# Docker deployment reference

Supplementary notes for **how Kulloo is structured in Docker** versus a **typical multi-service CPaaS deployment** (many containers: separate API, feature/signaling services, SBCs, multiple databases). This doc is a **mental map only** — not a guide to run some other vendor’s stack inside Kulloo.

---

## High-level mapping

| Concern | Typical multi-service CPaaS stack | Kulloo (this repo) |
|--------|------------------------------------------------------|---------------------|
| **Provisioning / REST** | Dedicated API (often **MySQL**-backed) | **Kulloo `api`** (Express, **MongoDB**) |
| **Call/session application logic** | **Feature server** + SIP app server (e.g. **Drachtio**) | **ESL** in Node (**`esl-call-handler.service.ts`**) + FreeSWITCH dialplan |
| **SIP edge** | **SBC** services + **Drachtio** | **Kamailio** (optional pool) → **FreeSWITCH** (Sofia), or direct FS for simpler dev |
| **Media** | **FreeSWITCH** (often MRF image) | **FreeSWITCH** (`signalwire/freeswitch` or MRF image in dev compose) |
| **Primary DB** | **MySQL** (common in large stacks) | **MongoDB** |
| **Cache / ephemeral** | **Redis** | **Redis** |
| **Time series** | **InfluxDB** + often **Prometheus** | Not required for hello milestone; add if you instrument later |
| **Web UI** | Bundled provisioning webapp | Not bundled; use API + your product UI |

---

## Compose topology

A **large CPaaS compose** often starts many containers: MySQL, Redis, Drachtio, InfluxDB, Prometheus, FreeSWITCH, API, webapp, feature server, several SBC-related services — plus env for public IP and secrets.

**Kulloo production** (`Docker/docker-compose.prod.yml`) is smaller:

- **mongodb**, **redis**, **api** (build from `backend/`)
- **fs1**, **fs2** (optional horizontal slice of media)
- **kamailio** (SIP 5060 → dispatcher → FS pool)

There is **no** Drachtio, **no** separate feature-server container: the **API process** owns HTTP and the **ESL TCP server** on port **3200**.

---

## Ports reminder (Kulloo production)

- **5060** — Kamailio (from carrier / Plivo)
- **5070 / 5071** — FreeSWITCH SIP on host (mapped from containers)
- **5000** — Kulloo HTTP API
- **3200** — ESL (FreeSWITCH → Kulloo)
- **UDP RTP** — non-overlapping ranges per FS (see `vars.fs1.xml` / `vars.fs2.xml`)

A **large CPaaS** compose often exposes many more ports (e.g. **9022** for a SIP application server, **3002** API, **3100** feature server, **5060/5062/5064** SBC-related listeners, **8086** Influx, **9090** Prometheus).

---

## Operational habits (shared patterns)

- **Single `docker compose up`** for a whole stack on one host.
- **Healthchecks** on DB/cache and app services.
- **Named volumes** for durability (Mongo/Redis/recordings).
- **Explicit public IP** for SIP/RTP (typical stacks: vendor-specific env vars for advertise IP; Kulloo: `vars.fs*.xml` + Plivo **`KAMAILIO_SIP_URI`** / `KAMAILIO_ADVERTISE_ADDRESS` for Kamailio).
- **Secrets in `.env`**, not committed (Kulloo template: `backend/.env.example`).

---

## Other platforms

Third-party voice platforms ship their **own** images, Compose files, and docs. Kulloo’s **`Docker/`** folder only describes **this** stack — not bundled software from elsewhere.
