/**
 * Registers Plivo XML Application endpoints on the root Express app so Answer and Hangup URLs work outside /api.
 * Plivo often calls these without the /api prefix; duplicate paths include /api variants for flexible configuration.
 */

/** Layer: routing only — attaches Plivo answer and hangup handlers to the main app. */
import type { Express } from "express";
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
}
