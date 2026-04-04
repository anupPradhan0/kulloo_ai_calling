import Redis from "ioredis";
import { env, isRedisConfigured } from "../../config/env";
import { logger } from "../../utils/logger";

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (!isRedisConfigured()) {
    return null;
  }
  if (!client) {
    client = new Redis(env.redisUrl as string, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number): number | null {
        if (times > 4) {
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });
    client.on("error", (err: Error) => {
      logger.error("redis_client_error", { err: err.message });
    });
    client.on("connect", () => {
      logger.info("redis_connected");
    });
  }
  return client;
}

export async function pingRedis(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!isRedisConfigured()) {
    return { ok: true, latencyMs: undefined };
  }
  const redis = getRedis();
  if (!redis) {
    return { ok: false, error: "client not initialized" };
  }
  try {
    const started = Date.now();
    await redis.ping();
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!client) {
    return;
  }
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
}
