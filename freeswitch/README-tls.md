# FreeSWITCH WSS TLS Setup (Production — Certbot)

The WebRTC `sip.js` client requires a **valid TLS certificate** to connect via WSS.
Self-signed certs are rejected by browsers. Follow these steps on your production server.

---

## Step 1 — Get a Certificate from Let's Encrypt

Run certbot on your server. Replace `yourdomain.com` with the actual domain pointing to your server's IP:

```bash
sudo certbot certonly --standalone -d yourdomain.com
```

> **Note**: port 80 must be open during certbot validation. Stop any process using port 80 temporarily.

---

## Step 2 — TLS directory (checked in under `conf`)

Certs live next to the rest of the config so Docker can use **one** read-only bind mount (`freeswitch/conf` → `/etc/freeswitch`). A separate `freeswitch/tls` bind is **not** used (nested mounts on a read-only parent fail on some engines).

```bash
mkdir -p /path/to/kulloo/freeswitch/conf/tls
```

---

## Step 3 — Copy the Certs Into `freeswitch/conf/tls`

```bash
# Replace yourdomain.com with your actual domain
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./freeswitch/conf/tls/wss.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem   ./freeswitch/conf/tls/wss.key

# Make them readable by the FreeSWITCH container process
sudo chmod 644 ./freeswitch/conf/tls/wss.pem
sudo chmod 640 ./freeswitch/conf/tls/wss.key
```

> FreeSWITCH looks for `wss.pem` and `wss.key` in the `tls-cert-dir` configured in the `webrtc` SIP profile (`/etc/freeswitch/tls` inside the container).

---

## Step 4 — Docker Compose

`Docker/docker-compose.yml` already mounts `./freeswitch/conf` at `/etc/freeswitch`. No extra TLS volume line is required.

---

## Step 5 — Restart FreeSWITCH

```bash
docker compose restart freeswitch
```

Verify the profile is loaded:

```bash
docker compose exec freeswitch fs_cli -x "sofia status"
# You should see profile "webrtc" listed with status RUNNING
```

---

## Step 6 — Update Backend `.env`

Set the WSS URL to match your domain and the same domain as the FS profile:

```env
FREESWITCH_WSS_URL=wss://yourdomain.com:7443
FREESWITCH_DOMAIN=yourdomain.com
```

Also update the SIP user password in `freeswitch/conf/directory/default/agent1.xml` to match `AGENT_SIP_PASSWORD`.

---

## Renewal

Certbot auto-renews certs but you need to re-copy them and restart FreeSWITCH after each renewal.
Add a cron job or a certbot deploy hook:

```bash
# /etc/letsencrypt/renewal-hooks/deploy/freeswitch.sh
#!/bin/bash
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /path/to/kulloo/freeswitch/conf/tls/wss.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem   /path/to/kulloo/freeswitch/conf/tls/wss.key
cd /path/to/kulloo && docker compose -f Docker/docker-compose.yml restart kulloo-fs1
```
