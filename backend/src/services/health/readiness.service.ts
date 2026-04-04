/**
 * Performs dependency health checks (MongoDB and Redis) that the HTTP readiness endpoint exposes as structured JSON.
 * Separated from Express so the same checks could be reused from a CLI or test without starting the full app stack.
 */

import mongoose from "mongoose";
import { pingRedis } from "../redis/redis.client";

/**
 * Runs a lightweight Mongo ping when the driver reports a connected state.
 * @returns ok with latency when the admin command succeeds, or an error description when not connected or ping fails.
 */
export async function checkMongoPing(): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
}> {
  try {
    if (mongoose.connection.readyState !== 1) {
      return {
        ok: false,
        error: `Not connected (readyState=${mongoose.connection.readyState})`,
      };
    }

    const db = mongoose.connection.db;
    if (!db) {
      return { ok: false, error: "No database handle" };
    }

    const started = Date.now();
    await db.admin().command({ ping: 1 });
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Aggregates Mongo and Redis ping results into the payload returned by GET /api/health.
 * @returns ok false when either dependency fails; includes per-check detail and process uptime for operators.
 */
export async function getReadinessPayload(): Promise<{
  ok: boolean;
  status: string;
  message: string;
  checks: {
    mongodb: Awaited<ReturnType<typeof checkMongoPing>>;
    redis: { configured: true; ok: boolean; latencyMs?: number; error?: string };
  };
  uptimeSeconds: number;
  timestamp: string;
}> {
  const mongo = await checkMongoPing();
  const ping = await pingRedis();
  const redis = {
    configured: true as const,
    ok: ping.ok,
    latencyMs: ping.latencyMs,
    ...(ping.error ? { error: ping.error } : {}),
  };

  const ok = mongo.ok && redis.ok;
  const status = ok ? "ok" : "degraded";

  return {
    ok,
    status,
    message: ok ? "Backend is healthy" : "Backend is up but dependencies failed checks",
    checks: {
      mongodb: mongo,
      redis,
    },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}
