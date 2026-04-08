# Kulloo Backend (Hello-Call Milestone)

TypeScript + Express + MongoDB backend with first end-to-end `hello-call` contract.

**Architecture and telephony (for people and AI assistants):** see [`doc/README.md`](../doc/README.md) in the repo root.

**Production deploy on a server (Docker Compose):** see [`doc/ops/deployment.md`](../doc/ops/deployment.md) (overview) and [`Docker/README.md`](../Docker/README.md) (full detail).

**Quick map of this package’s `src/` tree:** [`src/README.md`](src/README.md).

## Stack
- TypeScript (Node.js runtime)
- Express.js API
- MongoDB (Mongoose)
- Zod validation
- Optional Twilio/Plivo PSTN adapters

## Setup
1. Install dependencies:
```bash
pnpm install
```

2. Start MongoDB:
```bash
docker compose -f ../docker-compose.yml up -d --force-recreate
```

3. Configure env:
```bash
cp .env.example .env
```

4. Start backend:
```bash
pnpm run dev
```

## First Milestone APIs
Base URL: `http://localhost:5000/api`

- `POST /calls/outbound/hello`  
  Outbound flow with `Idempotency-Key` header
- `GET /calls`  
  List recent calls
- `GET /calls/:callId/recordings`  
  List recordings for a call
- `GET /recordings`  
  List recording metadata (newest first)
- `GET /recordings/:recordingId`  
  Fetch one recording metadata
- `GET /recordings/:recordingId/file`  
  Stream a recording file (when `filePath` exists)
- `GET /recordings/local`  
  List local `.wav` files under `RECORDINGS_DIR`
- `GET /recordings/local/:uuid`  
  Stream one local `.wav` (uuid without `.wav`)
- `POST /calls/callbacks/twilio/recording`  
  Optional callback to finalize Twilio recording metadata
- `POST /calls/callbacks/plivo/recording`  
  Plivo recording callback (deduped with Redis)
- `POST /calls/callbacks/freeswitch/recording`  
  Optional FreeSWITCH recording callback (deduped with Redis)

### Agent Softphone (WebRTC)

- `GET /agent/credentials`
  Returns FreeSWITCH WSS URL + SIP credentials for `sip.js`
- `POST /agent/status`
  Body: `{ "status": "available" | "offline" }`

## Plivo local testing (ngrok)
- Start ngrok: `ngrok http 5000`
- Set:
  - `PUBLIC_BASE_URL=https://<your-ngrok-domain>`
  - `PLIVO_ANSWER_URL=https://<your-ngrok-domain>/plivo/answer`
  - `PLIVO_HANGUP_URL=https://<your-ngrok-domain>/plivo/hangup`

## Sample Requests
Outbound hello call (SIP-local):
```bash
curl -X POST http://localhost:5000/api/calls/outbound/hello \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: hello-1" \
  -d '{"from":"sip:1001@local","to":"sip:2001@local","provider":"sip-local","recordingEnabled":true}'
```

Outbound hello call (Twilio/PSTN):
```bash
curl -X POST http://localhost:5000/api/calls/outbound/hello \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: hello-pstn-1" \
  -d '{"from":"+15550001111","to":"+15550002222","provider":"twilio","recordingEnabled":true}'
```

Outbound hello call (Plivo/PSTN):
```bash
curl -X POST http://localhost:5000/api/calls/outbound/hello \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: hello-pstn-plivo-1" \
  -d '{"from":"+15550001111","to":"+15550002222","provider":"plivo","recordingEnabled":true}'
```

## 10-20 Call Verification
Run repeatability checks with script:

Outbound SIP-like simulation:
```bash
pnpm run verify:hello outbound-sip 20 250
```

Outbound PSTN (defaults to Plivo; set `HELLO_CALL_PSTN_PROVIDER=twilio` for Twilio):
```bash
HELLO_CALL_FROM="+15550001111" HELLO_CALL_TO="+15550002222" pnpm run verify:hello outbound-pstn 10 1000
```

Script output includes per-call result and final success rate.

## Build
```bash
pnpm run build
pnpm start
```
