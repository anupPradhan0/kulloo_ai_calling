/**
 * Stores a short-lived mapping from outbound hello Idempotency-Key header to Mongo call id to avoid extra database reads.
 * Mongo still enforces uniqueness on idempotency keys; Redis is an optimization that may be cold or evicted.
 */

import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { env } from "../../config/env";
import { getRedis } from "./redis.client";

function redisKeyForIdempotency(idempotencyKey: string): string {
  const digest = createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
  return `${env.redisKeyPrefix}idempo:${digest}`;
}

/**
 * Reads the cached call id for a key when it exists and looks like a valid ObjectId string.
 * @param idempotencyKey Raw header value from the client.
 * @returns Mongo id string or undefined when cache miss or corrupt value.
 */
export async function peekCachedCallIdForIdempotencyKey(idempotencyKey: string): Promise<string | undefined> {
  const redis = getRedis();
  const raw = await redis.get(redisKeyForIdempotency(idempotencyKey));
  if (!raw || !Types.ObjectId.isValid(raw)) {
    return undefined;
  }
  return raw;
}

/**
 * Writes the mapping with a time-to-live so Redis memory stays bounded while repeat requests within the window hit cache.
 * @param idempotencyKey Same key the client sent on the original and repeat requests.
 * @param callId Mongo string id of the call row created or found for that key.
 */
export async function setCachedCallIdForIdempotencyKey(idempotencyKey: string, callId: string): Promise<void> {
  const redis = getRedis();
  await redis.set(redisKeyForIdempotency(idempotencyKey), callId, "EX", env.redisIdempotencyTtlSec);
}
