# Kulloo — Docker deployment (`Docker/`)

This folder contains **production-oriented** Docker Compose files. It is written for **humans** and for **AI/coding agents**: it focuses on *what to run*, *which env vars matter*, and *which ports must be open*.

> [!IMPORTANT]
> Run Compose from the **repository root** so `../` paths in these files resolve correctly.

---

## Choose a flow (pick exactly one)

Kulloo supports two SIP signaling flows:

| Flow | Signaling | Compose file | SIP ingress |
|------|-----------|--------------|------------|
| **Flow A (default)** | **Kamailio** → FreeSWITCH | `Docker/docker-compose.yml` | **5060** (Kamailio) |
| **Flow B (opt-in)** | **Drachtio** → FreeSWITCH | `Docker/docker-compose.flow-b.yml` | **5060** (Drachtio) |

Both flows keep the rest identical:
- **FreeSWITCH** handles media (RTP) and connects to Kulloo via **ESL outbound** on **3200**
- **MongoDB** + **Redis** are unchanged
- HTTP API stays on **5000**

Detailed Flow B design: [`doc/telephony/drachtio.md`](../doc/telephony/drachtio.md)

---

## One-time server setup

### `.env` at repo root

Create a repo-root `.env` from the template:

```bash
cp backend/.env.example .env
```

Minimum vars you typically set (see `backend/.env.example` for the full list):

- **Common (both flows)**:
  - `PUBLIC_BASE_URL`
  - `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_ANSWER_URL`, `PLIVO_HANGUP_URL`
  - Optional: `LOG_LEVEL`, `LOG_FORMAT`

- **Flow A (Kamailio)**:
  - `KAMAILIO_SIP_URI=sip:1000@<YOUR_PUBLIC_IP_OR_HOST>` (what Plivo dials)

- **Flow B (Drachtio)**:
  - `FREESWITCH_SIP_URI=sip:1000@fs1:5070` (Drachtio proxy target inside `kulloo_net`)
  - Optional: `DRACHTIO_SECRET` (must match the secret configured on the `drachtio` container)

### FreeSWITCH advertise / RTP correctness

Edit `freeswitch/conf/vars.fs1.xml` and `vars.fs2.xml` and ensure `external_sip_ip` is your server **public IP** (SDP/RTP). Wrong value = no audio / one-way audio.

---

## Flow A (default): Kamailio stack

Start:

```bash
docker compose -f Docker/docker-compose.yml up -d --build
```

Verify:

```bash
curl -sS http://127.0.0.1:5000/api/health
docker exec kulloo-kamailio kamctl dispatcher show
```

Stop (keeps volumes):

```bash
docker compose -f Docker/docker-compose.yml down
```

---

## Flow B (Drachtio): standalone stack

Start:

```bash
docker pull drachtio/drachtio-server:latest
docker compose -f Docker/docker-compose.flow-b.yml up -d --build
```

Verify:

```bash
curl -sS http://127.0.0.1:5000/api/health
docker logs kulloo-drachtio --tail 50
docker logs kulloo-api --tail 100 | grep -E 'drachtio|call_control'
```

Stop:

```bash
docker compose -f Docker/docker-compose.flow-b.yml down
```

---

## Ports / firewall checklist (production)

- **5000/tcp**: Kulloo HTTP API
- **3200/tcp**: ESL outbound (FreeSWITCH → Kulloo API)
- **5060/udp + 5060/tcp**: SIP ingress (**Kamailio** for Flow A, **Drachtio** for Flow B)
- **5070–5071/udp+tcp**: FreeSWITCH SIP host ports (optional for direct testing; carriers usually hit 5060 only)
- **RTP** (UDP):
  - fs1: **16384–17383/udp**
  - fs2: **17384–18383/udp**
- **9022/tcp**: Drachtio command socket is mapped to **127.0.0.1 only** (Flow B)
- **MongoDB/Redis**: mapped to **127.0.0.1 only** in these files

---

## About `docker-compose.drachtio.yml` (overlay)

`Docker/docker-compose.drachtio.yml` exists as an **overlay** that you can merge onto `Docker/docker-compose.yml` to “switch” to Drachtio while keeping the base file. If you prefer simplicity, ignore it and use the standalone Flow B file (`docker-compose.flow-b.yml`).

Overlay run (optional):

```bash
docker compose \
  -f Docker/docker-compose.yml \
  -f Docker/docker-compose.drachtio.yml \
  up -d --build
```

---

## Repo-root alternative layout

The repo root also contains `docker-compose.server.yml` + overlays. This `Docker/` layout is the recommended “single-folder deployment” entry point; the root layout is equivalent but uses different relative paths.
