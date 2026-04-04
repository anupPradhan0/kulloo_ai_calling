import dotenv from "dotenv";

dotenv.config();

const DEFAULT_PORT = 5000;
const DEFAULT_MONGO_URI = "mongodb://localhost:27017/sip-backend";

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  mongoUri: process.env.MONGODB_URI ?? DEFAULT_MONGO_URI,
  /** When set, enables Redis-backed idempotency cache and webhook deduplication. */
  redisUrl: process.env.REDIS_URL?.trim() || undefined,
  redisKeyPrefix: process.env.REDIS_KEY_PREFIX?.trim() || "kulloo:",
  redisIdempotencyTtlSec: parseIntEnv("REDIS_IDEMPOTENCY_TTL_SEC", 86_400),
  redisWebhookDedupeTtlSec: parseIntEnv("REDIS_WEBHOOK_DEDUPE_TTL_SEC", 172_800),
};

export function isRedisConfigured(): boolean {
  return Boolean(env.redisUrl && env.redisUrl.length > 0);
}
