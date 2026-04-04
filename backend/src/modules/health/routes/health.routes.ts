/** Liveness vs readiness (`/` includes Mongo + Redis checks via health controller). */
import { Router } from "express";
import { getLiveness, getReadiness } from "../controllers/health.controller";

export const healthRouter = Router();

healthRouter.get("/live", getLiveness);
healthRouter.get("/", getReadiness);
