/**
 * Builds Plivo XML responses for Answer URL (bridge into Kamailio → FreeSWITCH pool) and acknowledges Hang URL with JSON.
 *
 * Kamailio architecture:
 *   Plivo sends SIP INVITE → Kamailio:5060 → dispatcher selects fs1 or fs2 → FreeSWITCH → ESL → Kulloo
 *
 * The <User> target in the Dial XML must point to KAMAILIO (KAMAILIO_SIP_URI), NOT directly to FreeSWITCH.
 * Kamailio will select the next FreeSWITCH instance in round-robin order and forward the INVITE.
 * It passes ALL SIP headers through untouched — KullooCallId header survives the Kamailio hop.
 *
 * Fallback: if KAMAILIO_SIP_URI is not set, falls back to FREESWITCH_SIP_URI (pre-Kamailio direct mode).
 * This allows gradual migration and bare-metal setups without Kamailio.
 *
 * Answer flow extracts KullooCallId from query or body so outbound calls pre-created in Mongo attach to the correct SIP leg.
 */

/** Layer: HTTP only — reads env and request fields, returns XML or JSON; no Mongo writes here. */
import { Request, Response } from "express";
import { env } from "../../../config/env";
import { logger } from "../../../utils/logger";
import {
  extractKullooCallIdFromSources,
  extractPlivoCallUuidFromSources,
} from "../../../utils/plivo-payload";

/**
 * Responds with Plivo XML that dials the configured Kamailio SIP URI (or FreeSWITCH as fallback)
 * and replays KullooCallId on the SIP leg when known.
 *
 * Full call path when Kamailio is configured:
 *   Plivo → Kamailio:5060 (KullooCallId header preserved) → FS pool → ESL → Kulloo API
 */
export function sendPlivoAnswerXml(req: Request, res: Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const query = req.query as Record<string, unknown>;
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

  const callUuid = extractPlivoCallUuidFromSources(query, body);
  const kullooCallId = extractKullooCallIdFromSources(query, body);

  // Primary target: Kamailio SIP URI (routes to FreeSWITCH pool with load balancing)
  // Fallback: direct FreeSWITCH SIP URI (for deployments without Kamailio)
  const dialTarget = env.kamailioSipUri ?? env.freeswitchSipUri;
  const usingKamailio = Boolean(env.kamailioSipUri);

  if (!dialTarget) {
    logger.error("plivo_answer_missing_sip_target", {
      correlationId: req.correlationId,
      plivoCallUuid: callUuid,
      kullooCallId: kullooCallId ?? null,
      hint: "Set KAMAILIO_SIP_URI (preferred) or FREESWITCH_SIP_URI (direct mode) in environment",
    });
    res.type("application/xml").status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>SIP target is not configured.</Speak>
  <Hangup />
</Response>`,
    );
    return;
  }

  const sipHeadersAttr =
    typeof kullooCallId === "string" && /^[a-fA-F0-9]{24}$/.test(kullooCallId.trim())
      ? ` sipHeaders="KullooCallId=${kullooCallId.trim()}"`
      : "";
  if (!kullooCallId && callUuid) {
    logger.warn("plivo_answer_missing_kulloo_call_id", {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      plivoCallUuid: callUuid,
      hint: "Check sipHeaders on calls.create and Plivo Answer URL method (GET vs POST).",
    });
  }

  logger.info("plivo_answer_bridge_to_sip_target", {
    correlationId: req.correlationId,
    method: req.method,
    plPath: req.path,
    plivoCallUuid: callUuid ?? null,
    kullooCallId: typeof kullooCallId === "string" ? kullooCallId : null,
    hasSipHeaderReplay: Boolean(sipHeadersAttr),
    // Log whether Kamailio or direct FreeSWITCH is being used for observability
    routingMode: usingKamailio ? "kamailio_pool" : "direct_freeswitch",
    dialTarget,
  });

  // KullooCallId is passed as a SIP header via sipHeaders attribute.
  // Kamailio forwards this header untouched to FreeSWITCH.
  // FreeSWITCH exposes it as channel variable sip_h_X-PH-KullooCallId.
  // ESL handler reads it and attaches this ESL session to the pre-created Mongo Call document.
  res.type("application/xml").status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${sipHeadersAttr}>
    <User>${dialTarget}</User>
  </Dial>
</Response>`,
  );
}

/**
 * Minimal 200 JSON body so Plivo considers the hangup webhook delivered.
 */
export function plivoHangupAck(_req: Request, res: Response): void {
  res.status(200).json({ success: true });
}
