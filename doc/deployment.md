# Deploying Kulloo on a server

> **Doc hub:** [Documentation index](README.md) — this page is the **entry point** for production-style installs. **Full Compose details, file paths, and variants** live in [`Docker/README.md`](../../Docker/README.md).

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

RTP audio does **not** flow through Kamailio; it goes **Plivo ↔ FreeSWITCH**. See [kamailio.md](kamailio.md).

---

## Prerequisites

- **Docker** and **Docker Compose v2** on the server.
- **Public IPv4** (or correct advertise / SBC story) for SIP and SDP.
- **Firewall / security group** aligned with [freeswitch.md](freeswitch.md) and [kamailio.md](kamailio.md) (5060, FS SIP host ports, RTP UDP ranges).
- **Carrier** (e.g. Plivo) trunks / apps pointed at your **public** SIP endpoint and Answer URLs.

---

## Quick start (production Compose)

From the **repository root** after cloning:

```bash
cp backend/.env.example .env
# Edit .env: secrets, PLIVO_*, PUBLIC_BASE_URL, KAMAILIO_SIP_URI (public host:5060), etc.

docker compose -f Docker/docker-compose.yml up -d --build
```

Verify:

```bash
curl -sS http://127.0.0.1:5000/api/health
docker exec kulloo-kamailio kamcmd -s unix:/run/kamailio/kamailio_ctl dispatcher.list
```

**Drachtio (Flow B)** — use the standalone Flow B compose file (see [`Docker/README.md`](../../Docker/README.md)); it is **not** a merge overlay in this repo:

```bash
docker compose -f Docker/docker-compose.flow-b.yml up -d --build
```

Set **`FREESWITCH_SIP_URI`** (and Drachtio-related vars) in `.env` for that path. See [drachtio.md](drachtio.md).

**Stop** (keeps volumes) — use the same `-f` list you used for `up`:

```bash
docker compose -f Docker/docker-compose.yml down
```

---

## Configuration checklist

1. **`.env` at repo root** — template: [`backend/.env.example`](../../backend/.env.example). Inside Docker, `MONGODB_URI` / `REDIS_URL` are often overridden by Compose; still set **Plivo**, **`PUBLIC_BASE_URL`**, **`KAMAILIO_SIP_URI`**, **`RECORDINGS_DIR=/recordings`**, **`ESL_OUTBOUND_PORT=3200`** as needed.
2. **`freeswitch/conf/vars.fs1.xml`** and **`vars.fs2.xml`** — set **`external_sip_ip`** to the server **public** IP (SDP / RTP).
3. **Kamailio** — see [`kamailio/README.md`](../../kamailio/README.md) (e.g. advertise address when required).

---

## Alternate layouts

| Layout | When to use |
|--------|-------------|
| **[`Docker/docker-compose.yml`](../../Docker/docker-compose.yml)** | Default: **Kamailio + fs1 + fs2 + api + DBs** |
| **[`Docker/docker-compose.flow-b.yml`](../../Docker/docker-compose.flow-b.yml)** | **Flow B**: Drachtio + FreeSWITCH + api + DBs (standalone file; pick **either** Flow A or Flow B for SIP ingress) |

---

## Further reading

- **[`Docker/README.md`](../../Docker/README.md)** — Flow A vs Flow B, ports, env.
- **[kamailio.md](kamailio.md)** — Signaling, `KullooCallId`, failover behavior.
- **[freeswitch.md](freeswitch.md)** — Multi-instance FS, RTP ranges, **`mrf`** context.
- **[api.md](api.md)** — Health and REST surface.

