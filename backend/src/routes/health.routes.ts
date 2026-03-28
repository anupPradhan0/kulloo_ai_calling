import { Router } from "express";
import mongoose from "mongoose";

export const healthRouter = Router();

/** Minimal liveness: process is responding (use for dumb probes). */
healthRouter.get("/live", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "live",
    timestamp: new Date().toISOString(),
  });
});

/** Readiness: verifies MongoDB responds to ping. */
healthRouter.get("/", async (_req, res) => {
  const mongo = await checkMongo();

  const ok = mongo.ok;
  const status = ok ? "ok" : "degraded";

  res.status(ok ? 200 : 503).json({
    success: ok,
    status,
    message: ok ? "Backend is healthy" : "Backend is up but dependencies failed checks",
    checks: {
      mongodb: mongo,
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
