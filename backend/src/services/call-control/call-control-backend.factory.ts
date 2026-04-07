/**
 * Reads CALL_CONTROL_BACKEND env var and returns the correct CallControlBackend implementation.
 *
 * "kulloo"   (default) → KullooBackend  — Flow A: Kamailio + FreeSWITCH + ESL
 * "drachtio" (opt-in)  → DrachtioBackend — Flow B: Drachtio + FreeSWITCH + ESL
 *
 * This is the only place that reads the env var — everything else depends on the interface.
 * No switching at runtime: the env var picks one backend at startup and it stays for the
 * lifetime of the process.
 */

/** Layer: telephony infrastructure — factory; no business logic. */
import { env } from "../../config/env";
import type { CallControlBackend } from "./call-control-backend.interface";
import { KullooBackend } from "./kulloo-backend";
import { DrachtioBackend } from "./drachtio-backend";

/**
 * Returns the CallControlBackend selected by CALL_CONTROL_BACKEND.
 * Called once from server.ts bootstrap; the returned instance is started immediately.
 */
export function createCallControlBackend(): CallControlBackend {
  if (env.callControlBackend === "drachtio") {
    return new DrachtioBackend();
  }
  return new KullooBackend();
}
