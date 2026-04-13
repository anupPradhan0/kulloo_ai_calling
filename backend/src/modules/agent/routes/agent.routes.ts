/**
 * Agent softphone API routes.
 *
 * GET  /api/agent/credentials  — returns FreeSWITCH WSS URL + SIP credentials for sip.js.
 * POST /api/agent/status       — agent sets their availability (available / offline).
 * POST /api/agent/session/claim     — acquire single-agent lock (Redis) when AGENT_SINGLE_LOCK_ENABLED.
 * POST /api/agent/session/heartbeat — refresh lock TTL.
 * POST /api/agent/session/release   — release lock (tab close / logout).
 */

/** Layer: routing only — thin handlers. */
import { Router, Request, Response } from "express";
import { env } from "../../../config/env";
import { logger } from "../../../utils/logger";
import {
  claimAgentLock,
  refreshAgentLock,
  releaseAgentLock,
  verifyAgentLock,
} from "../services/agent-lock.service";
import {
  isAgentPanelAuthConfigured,
  issueAgentPanelToken,
  revokeAgentPanelToken,
  validateAgentPanelCredentials,
  verifyAgentPanelToken,
} from "../services/agent-panel-auth.service";

export const agentRouter = Router();

function panelTokenFrom(req: Request): string | undefined {
  const raw = req.headers["x-agent-panel-token"];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

async function requirePanelAuth(req: Request, res: Response): Promise<boolean> {
  if (!isAgentPanelAuthConfigured()) {
    return true;
  }
  const token = panelTokenFrom(req);
  if (!(await verifyAgentPanelToken(token))) {
    res.status(401).json({
      success: false,
      code: "AGENT_PANEL_AUTH_REQUIRED",
      message: "Agent panel login required.",
    });
    return false;
  }
  return true;
}

/** Public: whether the Agent UI must log in first (credentials set in env). */
agentRouter.get("/panel/config", (_req: Request, res: Response) => {
  res.json({
    success: true,
    authRequired: isAgentPanelAuthConfigured(),
  });
});

agentRouter.post("/panel/login", async (req: Request, res: Response) => {
  if (!isAgentPanelAuthConfigured()) {
    res.status(400).json({
      success: false,
      message: "Agent panel login is not configured (set AGENT_PANEL_USERNAME and AGENT_PANEL_PASSWORD).",
    });
    return;
  }
  const { username, password } = req.body as { username?: string; password?: string };
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ success: false, message: "username and password are required." });
    return;
  }
  if (!validateAgentPanelCredentials(username, password)) {
    res.status(401).json({ success: false, message: "Invalid username or password." });
    return;
  }
  try {
    const token = await issueAgentPanelToken();
    logger.info("agent_panel_login_ok", { component: "agent-panel" });
    res.json({ success: true, token });
  } catch (err) {
    logger.error("agent_panel_login_error", { err });
    res.status(500).json({ success: false, message: "Could not create session." });
  }
});

agentRouter.post("/panel/logout", async (req: Request, res: Response) => {
  const token = panelTokenFrom(req);
  await revokeAgentPanelToken(token);
  res.json({ success: true });
});

function sessionIdFrom(req: Request): string | undefined {
  const raw = req.headers["x-agent-session-id"];
  if (typeof raw === "string" && raw.trim().length >= 8) {
    return raw.trim();
  }
  return undefined;
}

/**
 * Returns the FreeSWITCH WSS connection details and SIP credentials.
 * When AGENT_SINGLE_LOCK_ENABLED, requires X-Agent-Session-Id matching an active claim.
 */
agentRouter.get("/credentials", async (req: Request, res: Response) => {
  if (!(await requirePanelAuth(req, res))) {
    return;
  }
  if (env.agentSingleLockEnabled) {
    const sid = sessionIdFrom(req);
    if (!sid) {
      res.status(400).json({
        success: false,
        message: "Missing X-Agent-Session-Id (claim /api/agent/session/claim first).",
      });
      return;
    }
    const ok = await verifyAgentLock(sid);
    if (!ok) {
      res.status(423).json({
        success: false,
        code: "AGENT_LOCK_LOST",
        message: "Agent session lock expired or was taken by another browser.",
      });
      return;
    }
  }

  // Use Kamailio WSS if configured (rtpengine handles ICE/DTLS),
  // otherwise fall back to FreeSWITCH WSS (legacy, 30s timeout)
  const wssUrl = env.kamailioWssUrl || env.freeswitchWssUrl;

  res.json({
    success: true,
    data: {
      wssUrl,
      domain: env.freeswitchDomain,
      username: env.agentSipUsername,
      password: env.agentSipPassword,
      stunServer: env.stunServerUrl,
    },
  });
});

agentRouter.post("/session/claim", async (req: Request, res: Response) => {
  if (!(await requirePanelAuth(req, res))) {
    return;
  }
  if (!env.agentSingleLockEnabled) {
    res.json({ success: true, locked: false });
    return;
  }

  const { sessionId } = req.body as { sessionId?: string };
  if (typeof sessionId !== "string" || sessionId.trim().length < 8) {
    res.status(400).json({ success: false, message: "sessionId must be a string (min 8 chars)." });
    return;
  }

  const result = await claimAgentLock(sessionId.trim());
  if (result === "held_by_other") {
    res.status(409).json({
      success: false,
      code: "AGENT_IN_USE",
      message: "Another browser already has the agent workstation session.",
    });
    return;
  }

  res.json({ success: true, locked: true });
});

agentRouter.post("/session/heartbeat", async (req: Request, res: Response) => {
  if (!(await requirePanelAuth(req, res))) {
    return;
  }
  if (!env.agentSingleLockEnabled) {
    res.json({ success: true });
    return;
  }
  const sid = sessionIdFrom(req);
  if (!sid) {
    res.status(400).json({ success: false, message: "Missing X-Agent-Session-Id" });
    return;
  }
  const ok = await verifyAgentLock(sid);
  if (!ok) {
    res.status(423).json({ success: false, code: "AGENT_LOCK_LOST", message: "Lock no longer valid." });
    return;
  }
  await refreshAgentLock(sid);
  res.json({ success: true });
});

agentRouter.post("/session/release", async (req: Request, res: Response) => {
  if (!(await requirePanelAuth(req, res))) {
    return;
  }
  if (!env.agentSingleLockEnabled) {
    res.json({ success: true });
    return;
  }
  const sid = sessionIdFrom(req);
  if (!sid) {
    res.status(400).json({ success: false, message: "Missing X-Agent-Session-Id" });
    return;
  }
  await releaseAgentLock(sid);
  res.json({ success: true });
});

/**
 * Agent sets their availability status.
 * v1: logged only — future versions will persist to DB and route calls to available agents.
 */
agentRouter.post("/status", async (req: Request, res: Response) => {
  if (!(await requirePanelAuth(req, res))) {
    return;
  }
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
