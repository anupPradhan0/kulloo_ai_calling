import { Router } from "express";
import mongoose from "mongoose";
import { isRedisConfigured } from "../config/env";
import { pingRedis } from "../services/redis/redis.client";

export const healthRouter = Router();

/** Minimal liveness: process is responding (use for dumb probes). */
healthRouter.get("/live", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "live",
    timestamp: new Date().toISOString(),
  });
});

/** Readiness: verifies MongoDB responds to ping; Redis when REDIS_URL is set. */
healthRouter.get("/", async (_req, res) => {
  const mongo = await checkMongo();

  let redis: { configured: boolean; ok: boolean; latencyMs?: number; error?: string };
  if (isRedisConfigured()) {
    const ping = await pingRedis();
    redis = {
      configured: true,
      ok: ping.ok,
      latencyMs: ping.latencyMs,
      ...(ping.error ? { error: ping.error } : {}),
    };
  } else {
    redis = { configured: false, ok: true };
  }

  const ok = mongo.ok && (!redis.configured || redis.ok);
  const status = ok ? "ok" : "degraded";

  res.status(ok ? 200 : 503).json({
    success: ok,
    status,
    message: ok ? "Backend is healthy" : "Backend is up but dependencies failed checks",
    checks: {
      mongodb: mongo,
      redis,
    },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

async function checkMongo(): Promise<{
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
