/**
 * Composes every JSON API router under the /api prefix so app.ts only mounts one child router.
 * Health, metrics, users, calls, and recordings each stay in their own module; this file is the single wiring point.
 */

/** Layer: routing only — attaches path prefixes to routers; no handlers or domain logic. */
import { Router } from "express";
import { healthRouter } from "../modules/health/routes/health.routes";
import { metricsRouter } from "./metrics.routes";
import { userRouter } from "../modules/users/routes/user.routes";
import { callRouter, recordingRouter } from "../modules/calls/routes/call.routes";

/** Root router mounted at /api in app.ts. */
export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/metrics", metricsRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/calls", callRouter);
apiRouter.use("/recordings", recordingRouter);
