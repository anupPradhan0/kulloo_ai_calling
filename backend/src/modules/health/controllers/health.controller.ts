/**
 * Implements simple liveness and richer readiness responses for Kubernetes-style probes and manual checks.
 * Readiness aggregates Mongo and Redis ping results from the health service without embedding probe logic here.
 */

/** Layer: HTTP only — returns JSON for probe endpoints; no database code in this file. */
import { Request, Response } from "express";
import { getReadinessPayload } from "../../../services/health/readiness.service";

/**
 * Always returns 200 when the Node process can execute this handler (process is up).
 */
export function getLiveness(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    status: "live",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Returns 200 when Mongo and Redis respond to pings, 503 when either dependency fails so traffic can be shifted away.
 */
export async function getReadiness(_req: Request, res: Response): Promise<void> {
  const payload = await getReadinessPayload();
  res.status(payload.ok ? 200 : 503).json({
    success: payload.ok,
    status: payload.status,
    message: payload.message,
    checks: payload.checks,
    uptimeSeconds: payload.uptimeSeconds,
    timestamp: payload.timestamp,
  });
}
