/**
 * Redis-backed single "agent workstation" lock so only one browser holds SIP credentials at a time.
 */

import { env, isRedisConfigured } from "../../../config/env";
import { getRedis } from "../../../services/redis/redis.client";

const LOCK_SUFFIX = "agent:single_lock";
const LOCK_TTL_SEC = 90;

function lockKey(): string {
  return `${env.redisKeyPrefix}${LOCK_SUFFIX}`;
}

/** Atomic claim: first session wins; same sessionId refreshes TTL. */
export async function claimAgentLock(sessionId: string): Promise<"granted" | "held_by_other"> {
  if (!isRedisConfigured()) {
    return "granted";
  }
  const redis = getRedis();
  const key = lockKey();
  const ok = await redis.set(key, sessionId, "EX", LOCK_TTL_SEC, "NX");
  if (ok === "OK") {
    return "granted";
  }
  const existing = await redis.get(key);
  if (existing === sessionId) {
    await redis.expire(key, LOCK_TTL_SEC);
    return "granted";
  }
  return "held_by_other";
}

export async function verifyAgentLock(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) {
    return false;
  }
  if (!isRedisConfigured()) {
    return true;
  }
  const cur = await getRedis().get(lockKey());
  return cur === sessionId;
}

export async function refreshAgentLock(sessionId: string): Promise<void> {
  if (!isRedisConfigured()) {
    return;
  }
  const redis = getRedis();
  const key = lockKey();
  const cur = await redis.get(key);
  if (cur === sessionId) {
    await redis.expire(key, LOCK_TTL_SEC);
  }
}

export async function releaseAgentLock(sessionId: string): Promise<void> {
  if (!isRedisConfigured()) {
    return;
  }
  const redis = getRedis();
  const key = lockKey();
  const cur = await redis.get(key);
  if (cur === sessionId) {
    await redis.del(key);
  }
}
