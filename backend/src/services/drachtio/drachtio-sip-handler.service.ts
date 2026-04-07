/**
 * Drachtio SIP INVITE handler — Flow B SIP signaling layer (replaces Kamailio in Flow A).
 *
 * Responsibility:
 *   Receive SIP INVITEs from Plivo (via the drachtio C++ server), read the KullooCallId header,
 *   and proxy the INVITE to FreeSWITCH — preserving KullooCallId exactly as Kamailio does.
 *
 * KullooCallId pass-through (mirrors kamailio.md §4):
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  Kamailio (Flow A):
 *    Plivo INVITE [KullooCallId: <id>] → Kamailio → t_relay() → FreeSWITCH [header intact]
 *    Kamailio passes ALL SIP headers untouched via t_relay(); no explicit forwarding needed.
 *
 *  Drachtio (Flow B):
 *    Plivo INVITE [KullooCallId: <id>] → drachtio:5060 → Node.js (command socket)
 *    → req.get('KullooCallId') reads the header
 *    → srf.proxyRequest(req, freeswitchTarget, {
 *         remainInDialog: true,            // mirrors Kamailio record_route()
 *         headers: { KullooCallId: id }    // explicit pass-through
 *       })
 *    → FreeSWITCH [KullooCallId intact] → ESL extractKullooCallId() → attach to Call row
 *
 * Two scenarios handled identically to Kamailio:
 *   Outbound (API-initiated): KullooCallId present → ESL attaches to pre-created Call row.
 *   Inbound DID (pure SIP):   KullooCallId absent  → ESL creates new inbound Call row.
 *
 * What does NOT change:
 *   ESL handler (esl-call-handler.service.ts) — zero changes; reads KullooCallId the same way.
 *   MongoDB Call / CallEvent / Recording models — unchanged.
 *   Redis idempotency / webhook dedupe — unchanged.
 *   All HTTP routes — unchanged.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Layer: telephony infrastructure — SIP signaling proxy; no business logic or direct DB access. */
import type { SipRequest, SipResponse } from "drachtio-srf";
import { srf, connectToDrachtio, disconnectFromDrachtio } from "./drachtio.client";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

/** SIP header name used as the stable correlation spine between API, SIP leg, and ESL. */
const KULLOO_CALL_ID_HEADER = "KullooCallId";

/**
 * Validates a 24-character hex string (Mongo ObjectId / KullooCallId format).
 * Matches the validation regex in esl-call-handler.service.ts extractKullooCallId().
 */
function isValidKullooCallId(value: unknown): value is string {
  return typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value.trim());
}

/**
 * Reads KullooCallId from a SIP request header, case-insensitively.
 *
 * Primary:  req.get('KullooCallId') — exact header name Plivo uses.
 * Fallback: scan req.headers entries for any key containing "kulloocallid" (case-insensitive).
 *           This fallback mirrors the ESL extractKullooCallId() pattern in
 *           esl-call-handler.service.ts so both layers agree on what counts as valid.
 *
 * Returns the 24-hex value if found and valid, null otherwise.
 */
function extractKullooCallId(req: SipRequest): string | null {
  // Primary path: exact header name
  const direct = req.get(KULLOO_CALL_ID_HEADER);
  if (isValidKullooCallId(direct)) return direct.trim();

  // Fallback: case-insensitive scan (Plivo may vary header casing)
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.toLowerCase().includes("kulloocallid")) {
      const val = String(value ?? "").trim();
      if (isValidKullooCallId(val)) return val;
    }
  }

  return null;
}

/**
 * Handles the SIP signaling layer for Flow B.
 * Lifecycle: connect() → registerInviteHandler() → (calls arrive) → disconnect().
 */
export class DrachtioSipHandlerService {
  /**
   * Target SIP URI for proxying INVITEs to FreeSWITCH.
   * In Flow B, Drachtio replaces Kamailio, so we proxy directly to FreeSWITCH
   * (FREESWITCH_SIP_URI). Falls back to KAMAILIO_SIP_URI if an operator reuses the same
   * URI convention. Hard fallback ensures the process fails loudly at proxy time if neither
   * is set, rather than silently at startup.
   */
  private readonly freeswitchTarget: string;

  constructor() {
    this.freeswitchTarget =
      env.freeswitchSipUri ??
      env.kamailioSipUri ??
      "sip:1000@127.0.0.1:5070";

    if (!env.freeswitchSipUri && !env.kamailioSipUri) {
      logger.warn("drachtio_no_freeswitch_target", {
        component: "drachtio",
        note: "Neither FREESWITCH_SIP_URI nor KAMAILIO_SIP_URI is set; using hardcoded fallback sip:1000@127.0.0.1:5070. Set FREESWITCH_SIP_URI for Flow B.",
      });
    }
  }

  /**
   * Connects to the external drachtio C++ server (command socket).
   * Called from DrachtioBackend.start() during bootstrap.
   */
  async connect(): Promise<void> {
    await connectToDrachtio();
  }

  /** Disconnects the drachtio command socket. Called on SIGTERM/SIGINT. */
  disconnect(): void {
    disconnectFromDrachtio();
  }

  /**
   * Registers the SIP INVITE handler on the shared Srf instance.
   *
   * For every incoming INVITE:
   *   1. Extract KullooCallId header (mirrors Kamailio t_relay() pass-through, but explicit).
   *   2. Proxy to FreeSWITCH with remainInDialog=true (mirrors Kamailio record_route()).
   *   3. Log structured events for observability.
   *
   * Must be called after connect() so the Srf instance is attached to the drachtio server.
   */
  registerInviteHandler(): void {
    srf.on("invite", (req: SipRequest, res: SipResponse) => {
      void this.handleInvite(req, res);
    });

    logger.info("drachtio_invite_handler_registered", {
      component: "drachtio",
      freeswitchTarget: this.freeswitchTarget,
      flow: "B",
      note: "SIP INVITE → KullooCallId read → proxy to FreeSWITCH → ESL handles media",
    });
  }

  /**
   * Core INVITE handler.
   *
   * KullooCallId header is forwarded explicitly so ESL can attach to the pre-created
   * Call document (outbound case) or create a new inbound Call (DID case).
   * This is the Drachtio equivalent of Kamailio's `t_relay()` for the KullooCallId header.
   */
  private async handleInvite(req: SipRequest, res: SipResponse): Promise<void> {
    const kullooCallId = extractKullooCallId(req);
    const from = req.get("from") ?? req.get("f") ?? "unknown";
    const to = req.get("to") ?? req.get("t") ?? "unknown";
    const callId = req.get("call-id") ?? req.get("i") ?? "unknown";

    logger.info("drachtio_invite_received", {
      component: "drachtio",
      sipCallId: callId,
      from,
      to,
      kullooCallId: kullooCallId ?? "absent",
      target: this.freeswitchTarget,
    });

    // Build explicit header forwarding map.
    // Kamailio forwards all headers untouched via t_relay().
    // Here we explicitly include KullooCallId so ESL can correlate in both scenarios:
    //   - Outbound: KullooCallId present → ESL attaches to API-created Call row
    //   - Inbound DID: KullooCallId absent → ESL creates new inbound Call row
    const forwardHeaders: Record<string, string> = {};
    if (kullooCallId) {
      forwardHeaders[KULLOO_CALL_ID_HEADER] = kullooCallId;
      logger.info("drachtio_forwarding_kulloo_call_id", {
        component: "drachtio",
        kullooCallId,
        target: this.freeswitchTarget,
        note: "Outbound path — ESL will attach to this KullooCallId (same as Kamailio Flow A)",
      });
    } else {
      logger.info("drachtio_no_kulloo_call_id", {
        component: "drachtio",
        note: "Inbound DID — no KullooCallId; ESL will create new inbound Call document",
      });
    }

    try {
      // proxyRequest forwards the INVITE to FreeSWITCH.
      // remainInDialog: true keeps Drachtio in the path for BYE/re-INVITE,
      //   mirroring Kamailio's record_route() behaviour in kamailio.cfg.
      // headers: forwards KullooCallId explicitly (Kamailio does this implicitly via t_relay).
      await srf.proxyRequest(req, this.freeswitchTarget, {
        remainInDialog: true,
        headers: forwardHeaders,
      });

      logger.info("drachtio_invite_proxied", {
        component: "drachtio",
        target: this.freeswitchTarget,
        kullooCallId: kullooCallId ?? "absent",
        note: "INVITE forwarded to FreeSWITCH; ESL will handle media and Mongo persistence",
      });
    } catch (err) {
      logger.error("drachtio_invite_proxy_error", {
        component: "drachtio",
        err,
        target: this.freeswitchTarget,
        kullooCallId: kullooCallId ?? "absent",
      });

      // Best-effort 503 to Plivo so it can retry or fail fast.
      try {
        res.send(503);
      } catch {
        // Connection may already be closed; ignore secondary error.
      }
    }
  }
}
