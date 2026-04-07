/**
 * Strategy interface for the SIP call-control backend.
 *
 * Two implementations exist:
 *   KullooBackend  — Flow A (default): SIP signaling via Kamailio; ESL drives media.
 *   DrachtioBackend — Flow B (opt-in):  SIP signaling via Drachtio C++ server; ESL still drives media.
 *
 * The active implementation is chosen once at startup by CALL_CONTROL_BACKEND env var.
 * Neither implementation touches ESL, MongoDB models, Redis, or any HTTP routes.
 */

/** Minimal lifecycle contract for a SIP call-control backend. */
export interface CallControlBackend {
  /** Human-readable name used in startup logs. */
  readonly name: string;

  /**
   * Start the backend. Called once during bootstrap after MongoDB and Redis are ready.
   * For Flow A (KullooBackend) this is a structured no-op — ESL is started separately.
   * For Flow B (DrachtioBackend) this connects to the external drachtio server and registers
   * the SIP INVITE handler.
   */
  start(): Promise<void>;

  /**
   * Gracefully stop the backend on SIGTERM/SIGINT.
   * For Flow A this is a no-op. For Flow B this disconnects the drachtio command socket.
   */
  stop(): Promise<void>;
}
