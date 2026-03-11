# Testing your SIP setup

This guide tells you **which app to use**, **what to enter in each field**, and **in what order** to run everything so you can test calls against your Drachtio + Node.js server.

---

## 1. Run order (do these in order)

| Step | When | What to do |
|------|------|------------|
| 1 | First | Start **Drachtio** (SIP engine) on your machine. |
| 2 | Second | Start the **Node.js app** (your logic) in this repo. |
| 3 | Third | Open the **SIP client app** (Zoiper or Linphone) and add an account. |
| 4 | Fourth | Place a **test call** (e.g. dial `123`). |

If you start the client or place a call before Drachtio and the Node app are running, the call will not be answered.

---

## 2. Which app to use

Use **one** of these as your “phone” to call your server:

| App | Where to get it | Good for |
|-----|-----------------|----------|
| **Zoiper** | [App Store](https://apps.apple.com/app/zoiper-sip-voip-softphone/id1202780216) / [Play Store](https://play.google.com/store/apps/details?id=com.zoiper.android.app) / [Desktop](https://www.zoiper.com/en/voip-softphone/download/current) | Phone + laptop; simple account form. |
| **Linphone** | [App Store](https://apps.apple.com/app/linphone/id360065638) / [Play Store](https://play.google.com/store/apps/details?id=org.linphone) / [Desktop](https://www.linphone.org/releases/) | Same; free and open source. |

You can use **Zoiper on your phone** and **Linphone on your laptop** (or both Zoiper, or both Linphone)—as long as the device is on the **same Wi‑Fi** as the machine running Drachtio (see “No audio?” below).

---

## 3. What to fill in the SIP account form

Your SIP client will ask for account details. Point everything to **your computer** where Drachtio is running.

Replace **`YOUR_IP`** with your machine’s IP on the LAN (e.g. `192.168.1.100`). On Linux you can run `ip addr` or `hostname -I` to see it.

### Zoiper

| Field | What to enter | Example |
|-------|----------------|--------|
| **Account name** | Any label (e.g. “My SIP test”) | `My SIP test` |
| **Domain / Host / Server** | Your machine’s IP and SIP port | `192.168.1.100` or `192.168.1.100:5060` |
| **Username** | Any username (this setup does not check it) | `testuser` |
| **Password** | Leave blank or any value | *(empty)* or `test` |
| **Transport** | UDP (default is fine) | UDP |

If there is a separate “Port” field, use **5060**. If the app only has “Server” or “Domain”, use **`YOUR_IP`** or **`YOUR_IP:5060`**.

### Linphone

| Field | What to enter | Example |
|-------|----------------|--------|
| **Username** | Any username | `testuser` |
| **Domain** | Your machine’s IP (and port if asked) | `192.168.1.100` or `192.168.1.100:5060` |
| **Password** | Leave blank or any value | *(empty)* |

If Linphone asks for “SIP proxy” or “Server”, use the same **`YOUR_IP`** and port **5060**.

### Summary of values

- **Server / Domain:** `YOUR_IP` (e.g. `192.168.1.100`)
- **Port:** `5060`
- **Username:** e.g. `testuser`
- **Password:** empty or anything
- **Transport:** UDP

---

## 4. Start the server and app (reminder)

On the machine that will receive the call:

**Terminal 1 – Drachtio**

```bash
cd /path/to/sip
drachtio -f drachtio.conf.xml
```

**Terminal 2 – Node app**

```bash
cd /path/to/sip
npm run build   # only needed after code changes
npm start
```

Wait until you see something like “Connected to SIP engine at …” in the Node app.

---

## 5. Place a test call

1. Open Zoiper or Linphone and make sure the account you created is **registered** (e.g. “Connected” or a green indicator).
2. In the dial pad, enter **any number** (e.g. `123` or `999`).
3. Tap **Call**.

**What should happen**

- The phone shows “Call connected” or “In progress”.
- In the Node app terminal you see: “Incoming call from: …”, then “Call answered!”, and after **5 seconds** “Call ended.” and the call hangs up.

If the call never connects, see “Troubleshooting” below.

---

## 6. Troubleshooting

### Call does not connect

- **Drachtio running?** In terminal 1 you must have `drachtio -f drachtio.conf.xml` running.
- **Node app running?** In terminal 2 you must see “Connected to SIP engine at …”.
- **Firewall:** Allow **UDP 5060** on the machine running Drachtio (e.g. `sudo ufw allow 5060/udp`).
- **Wrong IP:** The client must use the **LAN IP** of the machine where Drachtio runs (same Wi‑Fi network). Not `127.0.0.1` when calling from another device.

### No audio (call connects but no sound)

- **Same Wi‑Fi:** The phone (or other client) and the computer running Drachtio must be on the **same network** (e.g. same home Wi‑Fi). If the phone is on 4G/5G and the PC on Wi‑Fi, RTP (audio) often cannot reach the PC and you get no sound.
- **One-way audio:** Also often a network/NAT issue; keep both on the same LAN for testing.

### “Connection failed” or “Registration failed” in the app

- Check **Domain/Server** is exactly your PC’s IP (e.g. `192.168.1.100`).
- Check **port 5060** is used (and open in the firewall).
- Ensure Drachtio is running and bound to `0.0.0.0` (so it accepts connections from other devices). Our `drachtio.conf.xml` does this for SIP.

### Node app says “Failed to connect to SIP engine”

- Start **Drachtio first** (terminal 1), then run `npm start` (terminal 2).
- Confirm Drachtio is using the same config: `drachtio -f drachtio.conf.xml` from the repo directory.

---

## 7. Quick checklist

- [ ] Drachtio running: `drachtio -f drachtio.conf.xml`
- [ ] Node app running: `npm start`, see “Connected to SIP engine”
- [ ] Firewall allows UDP 5060
- [ ] SIP client account: Server = your PC IP, Port = 5060, Username = e.g. `testuser`, Password = blank
- [ ] Phone/laptop on **same Wi‑Fi** as the PC (for audio)
- [ ] Dial any number (e.g. `123`) and expect answer + auto hangup after 5 seconds
