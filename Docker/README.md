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
- **Web UI** (nginx) on **80** and **443** — proxies `/api` and `/ws` to the API; TLS uses host-mounted Let’s Encrypt certs (see **HTTPS** below)

**VEXYL-TTS** (for `AGENT_MODE=ai_voice`) is **optional**: it is not in the default `docker compose up` because it needs a separate `vexyl-tts/` tree at the repo root. Clone [VEXYL-TTS](https://github.com/vexyl-ai/vexyl-tts) into `vexyl-tts/`, then start with **`--profile ai`**. The first image build downloads PyTorch and TTS weights (several GB) and can take a long time.

Detailed Flow B design: [`doc/drachtio.md`](../doc/drachtio.md)

---

## HTTPS for the frontend (Let’s Encrypt)

The `web` service expects certificates on the **host** at:

`/etc/letsencrypt/live/<your-domain>/`

Compose mounts that directory to `/etc/nginx/ssl` inside the container (see `frontend/nginx.conf`). Replace the domain in `docker-compose.yml` if yours differs from `kulloocall.anuppradhan.in`.

**1. DNS** — `A` record for the hostname → your server’s public IP (propagate before continuing).

**2. Firewall** — allow **80/tcp** and **443/tcp** (and your SIP/RTP ports as already documented).

**3. Obtain a certificate** (HTTP-01 standalone — nothing may listen on **80** during validation):

```bash
cd /path/to/kulloo
docker compose -f Docker/docker-compose.yml stop web
sudo certbot certonly --standalone -d kulloocall.anuppradhan.in
docker compose -f Docker/docker-compose.yml build web --no-cache
docker compose -f Docker/docker-compose.yml up -d web
```

**4. App URLs** — set in repo-root `.env`:

- `PUBLIC_BASE_URL=https://kulloocall.anuppradhan.in`
- `PLIVO_ANSWER_URL` / `PLIVO_HANGUP_URL` / any webhook URLs must use **`https://kulloocall.anuppradhan.in/...`** as appropriate.

**5. Renewal** — `certbot renew` typically uses the same authenticator. For standalone, use a `--pre-hook` / `--post-hook` that stops/starts the `web` container, or switch to **webroot** + a location in nginx later.

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

### FreeSWITCH container image (`docker pull` / `fs_cli`)

Compose uses **`safarov/freeswitch:latest`** (Docker Hub). It ships FreeSWITCH 1.10.x with config under `/etc/freeswitch`, matching this repo’s `freeswitch/conf` layout.

The name **`signalwire/freeswitch`** (for example `:v1.10`) is **not available on Docker Hub** for anonymous pulls: the repository page returns **404**, and `docker pull` fails with *pull access denied / repository does not exist*. That is a **missing public image**, not something fixed by `docker login` unless your organization publishes a private replacement.

If you need a SignalWire-built container, build from the upstream [`signalwire/freeswitch` `docker/` directory](https://github.com/signalwire/freeswitch/tree/master/docker) or use a registry your team maintains.

Inbound Event Socket (`fs_cli` on port **8021**) is configured in `freeswitch/conf/freeswitch.xml` with **`listen-ip` `0.0.0.0`**, so `mod_event_socket` binds in environments where a default IPv6-only `::` listen address fails inside Docker.

---

## Flow A (default): Kamailio stack

The Compose file uses **`ghcr.io/kamailio/kamailio:5.8.7-bookworm`** (GitHub Container Registry). The old Docker Hub name `kamailio/kamailio` may fail with *pull access denied / repository does not exist* — that is expected; do not switch back unless you use a registry that still publishes it.

Start:

```bash
docker compose -f Docker/docker-compose.yml up -d --build
```

Verify:

```bash
curl -sS http://127.0.0.1:5000/api/health
curl -sS http://127.0.0.1/api/health
docker exec kulloo-kamailio kamcmd -s unix:/run/kamailio/kamailio_ctl dispatcher.list
curl -sS http://127.0.0.1:8088/health
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

- **80/tcp**: HTTP → redirects to HTTPS for the web UI
- **443/tcp**: HTTPS web UI (nginx; proxies `/api` and `/ws` to the API)
- **5000/tcp**: Kulloo HTTP API (direct access; Plivo webhooks often use `PUBLIC_BASE_URL` on 443/80 via your reverse proxy)
- **3200/tcp**: ESL outbound (FreeSWITCH → Kulloo API)
- **5060/udp + 5060/tcp**: SIP ingress (**Kamailio** for Flow A, **Drachtio** for Flow B)
- **5070–5071/udp+tcp**: FreeSWITCH SIP host ports (optional for direct testing; carriers usually hit 5060 only)
- **RTP** (UDP):
  - fs1: **16384–17383/udp**
  - fs2: **17384–18383/udp**
- **9022/tcp**: Drachtio command socket is mapped to **127.0.0.1 only** (Flow B)
- **MongoDB/Redis**: mapped to **127.0.0.1 only** in these files

---

## Historical note (overlays)

Some forks or older notes referred to a **`docker-compose.drachtio.yml` overlay** merged onto `docker-compose.yml`. **This repository** ships Flow B as a **single** file instead: [`docker-compose.flow-b.yml`](docker-compose.flow-b.yml). Do not run Flow A and Flow B stacks at once (both bind SIP **5060**).
