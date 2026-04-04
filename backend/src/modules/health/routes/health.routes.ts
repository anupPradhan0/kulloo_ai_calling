/**
 * Maps /live and / under /api/health to liveness and readiness handlers used by orchestrators and load balancers.
 */

/** Layer: routing only — wires HTTP verbs and paths to health controller functions. */
import { Router } from "express";
import { getLiveness, getReadiness } from "../controllers/health.controller";

export const healthRouter = Router();

healthRouter.get("/live", getLiveness);
healthRouter.get("/", getReadiness);
