# sip

This repository is for learning and experimenting with **SIP (Session Initiation Protocol)**, the signaling protocol used to set up, manage, and tear down real‑time communication sessions such as voice and video calls over IP networks.

SIP itself does **not** carry the audio or video; instead, it:
- **Locates users** using SIP addresses like `sip:alice@example.com`
- **Sets up calls** with messages like `INVITE`, negotiates media parameters using SDP
- **Manages calls** (ringing, accept, reject, hold, transfer, etc.)
- **Ends calls** with messages like `BYE`

Once a call is established using SIP, the actual media (audio/video) is typically sent using **RTP (Real-time Transport Protocol)** between the endpoints or via a media server.

Over time this project can include:
- Simple SIP call‑flow examples
- Sample SIP messages and explanations
- Small tools or code snippets for registering, placing calls, or analyzing SIP traffic

---

## Setup & run (Drachtio + Node.js)

This repo uses **Drachtio** as the SIP engine and a **Node.js** app (this codebase) as the logic that answers calls. Run the engine first, then the Node app, then use a SIP client (e.g. Zoiper or Linphone) to place a test call.

### Step 1 – Install Drachtio server

If you see **`command not found: drachtio`**, follow **[docs/INSTALL-DRACHTIO.md](docs/INSTALL-DRACHTIO.md)** for copy-paste install steps (Arch and Ubuntu). Drachtio is built with **autotools** (./autogen.sh, configure, make) and requires **Boost** and **libcurl** in addition to the usual build tools.

### Step 2 – Config

The repo includes `drachtio.conf.xml` at the project root. It configures:

- **Admin:** port `9022`, secret `cymru` (must match the Node app `srf.connect()` in `index.ts`). When the Node app runs on the same machine, admin is bound to `127.0.0.1`; if you move the Node app to another container/server, change the admin bind address to `0.0.0.0`.
- **SIP:** listen on all interfaces, port `5060` (UDP).

Run the server with the config (from the repo root):

```bash
drachtio -f drachtio.conf.xml
```

Or, without a config file, you can pass the SIP contact on the command line:

```bash
drachtio --contact "sip:*;transport=udp"
```

(Admin port and secret would then use defaults or environment variables; ensure they match `index.ts`.)

### Step 3 – Node app (TypeScript)

In the repo root:

```bash
npm install
npm run build
npm start
```

The app is written in TypeScript (`index.ts`). It connects to Drachtio at `127.0.0.1:9022` with secret `cymru`, answers incoming INVITEs, and hangs up after 5 seconds.

### Step 4 – Firewall

Allow SIP (UDP 5060) so clients can reach the server:

```bash
sudo ufw allow 5060/udp
```

(Adjust if you use a different firewall.)

### Step 5 – Test clients

See **[docs/TESTING.md](docs/TESTING.md)** for a full testing guide: which app to use (Zoiper, Linphone), what to fill in the account form, run order, and troubleshooting.

Use two “phones” to test (e.g. one on your laptop, one on your phone):

1. **Smartphone:** Install **Zoiper** or **Linphone** from the App Store / Play Store.
2. **Laptop:** Use the desktop version of **Zoiper** or **Linphone**, or a tool like **SIPp**.

In the client, register (or set the outbound proxy) to your Drachtio server:

- **Domain / server:** `[Your machine's IP]:5060` (e.g. your laptop’s LAN IP).
- **Username:** e.g. `testuser`.
- **Password:** leave blank or set anything; this simple setup does not authenticate.

Then place a call to any number (e.g. `123`). The Node app will answer and hang up after 5 seconds.

**Pro-tip (no audio):** Without a media server, RTP goes directly between the phone and the machine running Drachtio. Put the phone and that machine on the **same Wi‑Fi** (same router). If the phone is on 5G and the laptop on home Wi‑Fi, the SIP call may connect but you will get no audio.

### Summary checklist

1. **Install:** Drachtio server (from source or AUR) and run it (e.g. `drachtio -f drachtio.conf.xml`).
2. **Config:** `drachtio.conf.xml` in repo — admin port/secret must match `index.ts`.
3. **Run order:** Start Drachtio first → then `npm run build` and `npm start` in this repo.
4. **Firewall:** Allow UDP 5060 (e.g. `ufw allow 5060/udp`).
5. **Clients:** Zoiper or Linphone; same Wi‑Fi as the server for audio.
