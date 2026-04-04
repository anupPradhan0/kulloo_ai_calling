/**
 * Exposes a read-only snapshot of in-memory counters updated by ESL, call flows, and Redis-related paths.
 * Operators use this for quick health of traffic patterns without pulling full application logs.
 */

/** Layer: routing only — one GET handler delegating to the metrics service snapshot. */
import { Router } from "express";
import { metrics } from "../services/observability/metrics.service";

export const metricsRouter = Router();

metricsRouter.get("/", (_req, res) => {
  res.status(200).json({ success: true, data: metrics.snapshot() });
});
