/**
 * Optional agent UI login: when AGENT_PANEL_USERNAME + AGENT_PANEL_PASSWORD are set,
 * API + WebSocket require a short-lived token (stored in Redis).
 */

import crypto from "node:crypto";
import { env, isRedisConfigured } from "../../../config/env";
import { getRedis } from "../../../services/redis/redis.client";

const TOKEN_TTL_SEC = 12 * 60 * 60; // 12 hours

function redisKey(token: string): string {
  return `${env.redisKeyPrefix}agent_panel_token:${token}`;
}

export function isAgentPanelAuthConfigured(): boolean {
  return Boolean(env.agentPanelUsername && env.agentPanelPassword);
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function validateAgentPanelCredentials(username: string, password: string): boolean {
  if (!isAgentPanelAuthConfigured()) {
    return false;
  }
  return (
    timingSafeEqualString(username.trim(), env.agentPanelUsername) &&
    timingSafeEqualString(password, env.agentPanelPassword)
  );
}

export async function issueAgentPanelToken(): Promise<string> {
  if (!isRedisConfigured()) {
    throw new Error("Redis required for agent panel auth");
  }
  const token = crypto.randomBytes(32).toString("hex");
  const redis = getRedis();
  await redis.set(redisKey(token), "1", "EX", TOKEN_TTL_SEC);
  return token;
}

export async function verifyAgentPanelToken(token: string | undefined | null): Promise<boolean> {
  if (!token || !token.trim()) {
    return false;
  }
  if (!isRedisConfigured()) {
    return false;
  }
  try {
    const redis = getRedis();
    const v = await redis.get(redisKey(token.trim()));
    return v === "1";
  } catch {
    return false;
  }
}

export async function revokeAgentPanelToken(token: string | undefined | null): Promise<void> {
  if (!token?.trim() || !isRedisConfigured()) {
    return;
  }
  try {
    const redis = getRedis();
    await redis.del(redisKey(token.trim()));
  } catch {
    /* ignore */
  }
}
