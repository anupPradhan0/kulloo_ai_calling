# Deploying Kulloo on a server

> **Doc hub:** [Documentation index](README.md) — this page is the **entry point** for production-style installs. **Full Compose details, file paths, and variants** live in [`Docker/README.md`](../Docker/README.md).

---

## What you are deploying

A typical **production** install runs:

| Component | Purpose |
|-----------|---------|
| **Kulloo API** (`backend` image) | HTTP API (`5000`), **ESL** listener (**`3200`**) — FreeSWITCH connects here |
| **MongoDB** | Calls, events, recordings metadata |
| **Redis** | Required: idempotency + webhook dedupe |
| **FreeSWITCH** (often **fs1** + **fs2**) | SIP/RTP media, **hello** dialplan → ESL |
| **Kamailio** (recommended for pool) | SIP **5060** from carrier → dispatcher → FS instances |

RTP audio does **not** flow through Kamailio; it goes **Plivo ↔ FreeSWITCH**. See [telephony/kamailio.md](telephony/kamailio.md).

---

## Prerequisites

- **Docker** and **Docker Compose v2** on the server.
- **Public IPv4** (or correct advertise / SBC story) for SIP and SDP.
- **Firewall / security group** aligned with [telephony/freeswitch.md](telephony/freeswitch.md) and [telephony/kamailio.md](telephony/kamailio.md) (5060, FS SIP host ports, RTP UDP ranges).
- **Carrier** (e.g. Plivo) trunks / apps pointed at your **public** SIP endpoint and Answer URLs.

---

## Quick start (production Compose)

From the **repository root** after cloning:

```bash
cp backend/.env.example .env
# Edit .env: secrets, PLIVO_*, PUBLIC_BASE_URL, KAMAILIO_SIP_URI (public host:5060), etc.

docker compose -f Docker/docker-compose.prod.yml up -d --build
```

Verify:

```bash
curl -sS http://127.0.0.1:5000/api/health
docker exec kulloo-kamailio kamctl dispatcher show
```

**Stop** (keeps volumes):

```bash
docker compose -f Docker/docker-compose.prod.yml down
```

---

## Configuration checklist

1. **`.env` at repo root** — template: [`backend/.env.example`](../backend/.env.example). Inside Docker, `MONGODB_URI` / `REDIS_URL` are often overridden by Compose; still set **Plivo**, **`PUBLIC_BASE_URL`**, **`KAMAILIO_SIP_URI`**, **`RECORDINGS_DIR=/recordings`**, **`ESL_OUTBOUND_PORT=3200`** as needed.
2. **`freeswitch/conf/vars.fs1.xml`** and **`vars.fs2.xml`** — set **`external_sip_ip`** to the server **public** IP (SDP / RTP).
3. **Kamailio** — see [`kamailio/README.md`](../kamailio/README.md) (e.g. advertise address when required).

---

## Alternate layouts

| Layout | When to use |
|--------|-------------|
| **[`Docker/docker-compose.prod.yml`](../Docker/docker-compose.prod.yml)** | Single file, **Kamailio + fs1 + fs2 + api + DBs** (recommended in `Docker/README.md`) |
| **Root `docker-compose.server.yml` + `docker-compose.kamailio.yml`** | Same stack, **two** compose invocations (see comments in those files) |
| **`Docker/docker-compose.dev.yml`** | Local **Mongo + Redis + one FS**; run API on host with `pnpm dev` |

---

## Further reading

- **[`Docker/README.md`](../Docker/README.md)** — Commands, troubleshooting, dev/redis-only compose, port recap.
- **[`Docker/DEPLOYMENT-REFERENCE.md`](../Docker/DEPLOYMENT-REFERENCE.md)** — How Kulloo’s Docker topology compares to a large multi-service CPaaS layout.
- **[telephony/kamailio.md](telephony/kamailio.md)** — Signaling, `KullooCallId`, failover behavior.
- **[telephony/freeswitch.md](telephony/freeswitch.md)** — Multi-instance FS, RTP ranges, **`mrf`** context.
- **[reference/api.md](reference/api.md)** — Health and REST surface.
