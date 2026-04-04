/**
 * Prevents provider recording webhooks from running ingestion logic twice when the carrier retries the same delivery.
 * Uses Redis SET with NX and expiry so the first request wins and duplicates still get a success response without side effects.
 */

import { env } from "../../config/env";
import { getRedis } from "./redis.client";

/**
 * Attempts to claim exclusive processing for one logical webhook (Twilio, Plivo, or FreeSWITCH identity tuple).
 * @param kind Which provider namespace to use in the Redis key.
 * @param parts Values that together uniquely identify this webhook (for example call id and recording id).
 * @returns true when this invocation should run business logic; false when a duplicate should short-circuit.
 */
export async function claimRecordingWebhookOnce(kind: "twilio" | "plivo" | "freeswitch", parts: string[]): Promise<boolean> {
  const redis = getRedis();
  const safe = parts.map((p) => encodeURIComponent(p)).join(":");
  const key = `${env.redisKeyPrefix}webhook:${kind}:${safe}`;
  const res = await redis.set(key, "1", "EX", env.redisWebhookDedupeTtlSec, "NX");
  return res === "OK";
}
