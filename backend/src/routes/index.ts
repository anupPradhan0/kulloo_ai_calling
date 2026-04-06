/**
 * Composes every JSON API router under the /api prefix so app.ts only mounts one child router.
 * Health, metrics, calls, and recordings each stay in their own module; this file is the single wiring point.
 */

/** Layer: routing only — attaches path prefixes to routers; no handlers or domain logic. */
import { Router } from "express";
import { healthRouter } from "../modules/health/routes/health.routes";
import { metricsRouter } from "./metrics.routes";
import { callRouter, recordingRouter } from "../modules/calls/routes/call.routes";
import { listAllRecordings } from "../modules/calls/controllers/call.controller";

/** Root router mounted at /api in app.ts. */
export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/metrics", metricsRouter);
apiRouter.use("/calls", callRouter);
/** Exact GET /api/recordings — must live on the parent router; a child `Router` mounted at `/recordings` often does not match remainder `/` reliably. */
apiRouter.get("/recordings", listAllRecordings);
apiRouter.use("/recordings", recordingRouter);
