# Redis in Kulloo

Redis is **optional**. If `REDIS_URL` is unset, the API behaves as before: MongoDB enforces outbound idempotency; recording webhooks rely on Mongo upserts only.

## Configuration

| Variable | Meaning |
|----------|---------|
| `REDIS_URL` | e.g. `redis://localhost:6379` or `redis://redis:6379` in Docker. When set, Redis features are enabled. |
| `REDIS_KEY_PREFIX` | Namespace prefix for keys (default `kulloo:`). |
| `REDIS_IDEMPOTENCY_TTL_SEC` | TTL for `Idempotency-Key` → call id cache (default 86400). |
| `REDIS_WEBHOOK_DEDUPE_TTL_SEC` | TTL for recording webhook dedupe keys (default 172800). |

## Docker

- **Local:** `docker-compose.yml` includes a `redis` service on port 6379.
- **Server stack:** `docker-compose.server.yml` runs Redis and sets `REDIS_URL=redis://redis:6379` on the API service.

## Behavior

1. **Outbound hello (`POST /api/calls/outbound/hello`)** — After `Idempotency-Key` hashing, Kulloo may read a cached Mongo call id from Redis to avoid an extra Mongo lookup on repeats; writes populate the cache. Mongo remains authoritative (unique `idempotencyKey` index).

2. **Recording webhooks** — Twilio, Plivo, and FreeSWITCH callbacks use `SET … NX` with a TTL. Duplicate deliveries return `200` with `{ success: true, duplicate: true }` without re-running ingestion.

3. **Health** — `GET /api/health` includes a `redis` check. If `REDIS_URL` is set and Redis does not respond to `PING`, readiness returns **503**.

4. **Metrics** — `GET /api/metrics` includes `redisIdempotencyHits`, `redisIdempotencyMisses`, and `webhookDedupeSkips`.

## Operational notes

- Webhook signing / provider authentication is still recommended separately; Redis dedupe only stops duplicate processing when the same callback is delivered twice.
- Use TTLs so Redis memory stays bounded; do not rely on Redis alone for financial-grade idempotency—Mongo indexes remain the backstop.
