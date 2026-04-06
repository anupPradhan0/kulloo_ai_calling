# Kamailio — Kulloo SIP Load Balancer

> **Architecture doc:** [doc/telephony/kamailio.md](../doc/telephony/kamailio.md)

Kamailio acts as a pure **SIP signaling proxy** in front of the FreeSWITCH instance pool. It distributes inbound SIP INVITEs using round-robin, health-checks each FreeSWITCH with OPTIONS pings, and passes all SIP headers through untouched — including the critical `KullooCallId` header used for Mongo call correlation.

**Kamailio does NOT relay RTP audio.** Media flows directly between Plivo and FreeSWITCH.

---

## Directory Structure

```
kamailio/
  kamailio.cfg      # Main Kamailio config (modules, routing logic, dispatcher params)
  dispatcher.list   # FreeSWITCH instance pool (setid, URI, flags, attrs)
  README.md         # This file
```

---

## Port Plan

| Service   | SIP Port | Notes |
|-----------|----------|-------|
| Kamailio  | **5060** UDP+TCP | Receives from Plivo / PSTN |
| fs1       | **5070** UDP+TCP | Receives from Kamailio |
| fs2       | **5071** UDP+TCP (host) / **5070** (container) | Receives from Kamailio |

Kamailio routes to `sip:fs1:5070` and `sip:fs2:5070` — inside Docker these resolve to each container's internal port. The host port mapping is different for each FS.

---

## Running with Docker Compose

```bash
# Start the full stack (server + Kamailio)
docker compose -f docker-compose.server.yml -f docker-compose.kamailio.yml up -d

# Or start Kamailio standalone (for testing)
docker compose -f docker-compose.kamailio.yml up -d
```

---

## Checking Kamailio Status

```bash
# View dispatcher pool status (shows which FS instances are active/inactive)
docker exec kamailio kamctl dispatcher show

# Example output:
# 1  sip:fs1:5070  Active   (0 failures)
# 1  sip:fs2:5070  Active   (0 failures)

# Reload dispatcher.list without restarting Kamailio
docker exec kamailio kamctl dispatcher reload

# View Kamailio logs
docker logs kamailio --tail=100 -f

# Send a test OPTIONS ping to verify Kamailio is up
sipsak -s sip:<KAMAILIO_PUBLIC_IP>:5060
```

---

## Health Check Behavior

- Kamailio sends **OPTIONS** requests to each FS every **10 seconds** (`ds_ping_interval=10`)
- An FS is marked **inactive** after **3 consecutive failures** (`ds_probing_threshold=3`)
- An FS is re-enabled after receiving a **successful reply** (2xx, 404, 480 count as healthy)
- When all FS instances are down: Kamailio returns `503 Service Unavailable` to Plivo

---

## Adding a Third FreeSWITCH Instance

1. Add to `dispatcher.list`:
   ```
   1  sip:fs3:5070  0  0  duid=fs3;role=media
   ```

2. Add `fs3` service to `docker-compose.server.yml` with:
   - Host SIP port: `5072:5070`
   - RTP range: `18384:19383` (non-overlapping)
   - Own `vars.fs3.xml` with `rtp_start_port=18384`, `rtp_end_port=19383`

3. Reload dispatcher (no Kamailio restart needed):
   ```bash
   docker exec kamailio kamctl dispatcher reload
   ```

---

## KullooCallId Header Flow

```
Plivo → Kamailio (SIP INVITE + header: KullooCallId: <24-hex>)
         ↓ (passes ALL headers through, UNTOUCHED)
       FreeSWITCH → ESL socket → Kulloo API
                    (reads KullooCallId, attaches to Mongo Call doc)
```

Kamailio performs **no header stripping**. The `record_route()` call adds Kamailio's own Route header but leaves all `X-PH-*` and custom SIP headers intact on the `INVITE`.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `503 Service Unavailable` | `kamctl dispatcher show` — are both FS instances active? |
| Silent/one-way audio | `ext-rtp-ip` in `vars.fs1.xml`/`vars.fs2.xml` must be the **public IP** |
| KullooCallId missing in ESL | Verify Kamailio logs show header in INVITE; check FS variable `sip_h_X-PH-KullooCallId` |
| Calls stuck at `connected` | ESL not reaching API on port 3200 — check `kulloo_esl_host` in vars.xml |
| FS not coming online in dispatcher | Check FS is actually listening on port 5070 (`docker logs fs1`) |
