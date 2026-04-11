/**
 * Registers Plivo XML Application endpoints on the root Express app so Answer and Hangup URLs work outside /api.
 * Plivo often calls these without the /api prefix; duplicate paths include /api variants for flexible configuration.
 */

/** Layer: routing only — attaches Plivo answer and hangup handlers to the main app. */
import type { Express, Request, Response } from "express";
import { plivoHangupAck, sendPlivoAnswerXml } from "../controllers/plivo-answer.controller";

/**
 * Wires both /plivo/* and /api/plivo/* routes to the same controller functions.
 */
export function registerPlivoWebhookRoutes(app: Express): void {
  app.all("/plivo/answer", (req, res) => {
    sendPlivoAnswerXml(req, res);
  });
  app.all("/api/plivo/answer", (req, res) => {
    sendPlivoAnswerXml(req, res);
  });

  app.post("/plivo/hangup", plivoHangupAck);
  app.post("/api/plivo/hangup", plivoHangupAck);

  // GET is not used by Plivo (hangup is POST); these avoid "Route not found" when opening URLs in a browser.
  const hangupGetHint = (_req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: "Plivo hangup webhook — use POST (browser GET is only for a quick check).",
    });
  };
  app.get("/plivo/hangup", hangupGetHint);
  app.get("/api/plivo/hangup", hangupGetHint);
}
