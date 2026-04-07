/**
 * Flow B (opt-in) call-control backend.
 *
 * Drachtio replaces Kamailio at the SIP signaling layer only.
 * srf.connect() attaches to the external drachtio C++ server on DRACHTIO_HOST:DRACHTIO_PORT
 * (command socket, default 9022). Plivo sends SIP INVITEs to the drachtio container on port 5060.
 *
 * ESL, MongoDB, Redis, HTTP routes — all unchanged (same as Flow A).
 */

/** Layer: telephony infrastructure — Flow B wrapper; owns drachtio lifecycle. */
import type { CallControlBackend } from "./call-control-backend.interface";
import { DrachtioSipHandlerService } from "../drachtio/drachtio-sip-handler.service";
import { logger } from "../../utils/logger";

export class DrachtioBackend implements CallControlBackend {
  readonly name = "drachtio";
  private readonly handler: DrachtioSipHandlerService;

  constructor() {
    this.handler = new DrachtioSipHandlerService();
  }

  /**
   * Connects to the external drachtio C++ server and registers the SIP INVITE handler.
   * The INVITE handler mirrors Kamailio's pass-through of KullooCallId to FreeSWITCH.
   */
  async start(): Promise<void> {
    await this.handler.connect();
    this.handler.registerInviteHandler();

    logger.info("call_control_backend_active", {
      backend: this.name,
      flow: "B",
      component: "call-control",
      note: "Plivo → Drachtio (C++) → FreeSWITCH → ESL → Kulloo",
    });
  }

  /** Disconnects the drachtio command socket cleanly on shutdown. */
  async stop(): Promise<void> {
    this.handler.disconnect();
    logger.info("call_control_backend_stopped", {
      backend: this.name,
      component: "call-control",
    });
  }
}
