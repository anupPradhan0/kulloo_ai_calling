/**
 * Flow A (default) call-control backend.
 *
 * Kamailio is the SIP load balancer and FreeSWITCH is the media server in this path.
 * ESL outbound socket (port 3200) drives the hello flow — started separately in server.ts.
 * This class satisfies the CallControlBackend interface without touching any existing code.
 */

/** Layer: telephony infrastructure — Flow A wrapper; no-op lifecycle methods. */
import type { CallControlBackend } from "./call-control-backend.interface";
import { logger } from "../../utils/logger";

export class KullooBackend implements CallControlBackend {
  readonly name = "kulloo";

  /**
   * Logs the active flow for observability. All real startup (ESL, recovery, HTTP) is in
   * server.ts and is entirely unaffected by this backend selection.
   */
  async start(): Promise<void> {
    logger.info("call_control_backend_active", {
      backend: this.name,
      flow: "A",
      component: "call-control",
      note: "Plivo → Kamailio → FreeSWITCH → ESL → Kulloo (default path, no change)",
    });
  }

  /** Flow A has no backend-owned resources to release. */
  async stop(): Promise<void> {
    // No-op: ESL server and Redis are shut down by their own hooks in server.ts.
  }
}
