# Kulloo API Reference

> **Doc hub:** [Documentation index](../README.md) — call flows and FreeSWITCH/ESL are under `doc/telephony/`.

Base URL (production): `https://kulloocall.anuppradhan.in`

All routes below are relative to the base URL.

**Redis** (`REDIS_URL`) is **required**: the API exits on startup if it is missing or unreachable, and readiness always checks **`PING`**. See [redis.md](./redis.md).

**ESL** (Event Socket: FreeSWITCH → Kulloo on `ESL_OUTBOUND_PORT`) drives the hello media flow; see [esl.md](../telephony/esl.md).

## Health

- `GET /api/health/live`
  - Liveness probe (process responding)
- `GET /api/health`
  - Readiness probe (Mongo ping + Redis `PING`)

## Calls

Full outbound (Plivo → Kamailio → FreeSWITCH pool → ESL) architecture and data flow: see [outbound-calls.md](../telephony/outbound-calls.md).

- `POST /api/calls/outbound/hello`
  - Runs the outbound “hello” flow
  - Returns `Idempotency-Key: <unique>` for idempotency.
- `GET /api/calls/:callId/recordings`
  - List recording metadata for a call

### Agent Softphone (`AGENT_MODE=webrtc`)

- `GET /api/agent/credentials`
  - Returns connection details for the frontend SIP client: `username`, `password`, `domain`, `wssUrl`, and `stunServer`.
- `POST /api/agent/status`
  - Body: `{ status: 'Available' | 'Offline' }`
  - Updates the backend with the current availability of the agent.
- `WS /ws/agent`
  - Out-of-band WebSocket for real-time call states. Broadcasts events such as `inbound_call.offered`, `call.answered`, and `call.ended` directly to the browser.

### Provider callbacks (webhooks)

- `POST /api/calls/callbacks/twilio/recording`
- `POST /api/calls/callbacks/plivo/recording`
- `POST /api/calls/callbacks/freeswitch/recording`

## Recordings

### Local recordings (shared `/recordings` volume)

- `GET /api/recordings/local`
  - Lists local `.wav` files
- `GET /api/recordings/local/:uuid`
  - Streams local `.wav` file (UUID without `.wav`)

### Recording metadata + file

- `GET /api/recordings`
  - List recording metadata from MongoDB (newest first). Optional query: `limit` (default 200, max 500).
- `GET /api/recordings/:recordingId`
  - Returns recording metadata from MongoDB
- `GET /api/recordings/:recordingId/file`
  - Streams recording file if `filePath` exists in MongoDB

## Plivo XML application webhooks

These routes return Plivo XML (Answer URL) or a simple JSON success (Hangup URL).

- `ANY /plivo/answer`
- `ANY /api/plivo/answer`
- `POST /plivo/hangup`
- `POST /api/plivo/hangup`

