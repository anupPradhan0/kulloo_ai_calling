/**
 * Agent softphone API routes.
 *
 * GET  /api/agent/credentials  — returns FreeSWITCH WSS URL + SIP credentials for sip.js.
 * POST /api/agent/status       — agent sets their availability (available / offline).
 *
 * These routes are intentionally thin: credentials come from env (not DB) in v1;
 * status is logged and acknowledged but not persisted yet.
 */

/** Layer: routing only — thin handlers, no business logic. */
import { Router, Request, Response } from "express";
import { env } from "../../../config/env";
import { logger } from "../../../utils/logger";

export const agentRouter = Router();

/**
 * Returns the FreeSWITCH WSS connection details and SIP credentials.
 * The frontend sip.js uses these to register as a SIP endpoint over WebSocket.
 */
agentRouter.get("/credentials", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      /** WSS URL for sip.js UserAgent transportOptions.server */
      wssUrl: env.freeswitchWssUrl,
      /** SIP domain — used in sip URI: sip:<username>@<domain> */
      domain: env.freeswitchDomain,
      /** SIP username the agent registers with */
      username: env.agentSipUsername,
      /** SIP password */
      password: env.agentSipPassword,
      /** STUN server for WebRTC ICE negotiation */
      stunServer: env.stunServerUrl,
    },
  });
});

/**
 * Agent sets their availability status.
 * v1: logged only — future versions will persist to DB and route calls to available agents.
 */
agentRouter.post("/status", (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };

  if (status !== "available" && status !== "offline") {
    res.status(400).json({ success: false, message: "status must be 'available' or 'offline'" });
    return;
  }

  logger.info("agent_status_change", {
    component: "agent",
    status,
    correlationId: req.correlationId,
  });

  res.json({ success: true, status });
});
