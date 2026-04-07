/**
 * Drachtio C++ server connection lifecycle (Flow B only).
 *
 * Creates the shared drachtio-srf Srf instance and exposes connect/disconnect helpers.
 * The Srf instance is created eagerly (safe — no connection happens until connect() is called).
 * DrachtioSipHandlerService imports `srf` from here to register event handlers.
 *
 * Architecture:
 *   drachtio C++ container (port 9022 command socket) ← srf.connect() ← this module
 *   drachtio C++ container (port 5060 SIP) ← Plivo SIP INVITEs
 *
 * Port clarification:
 *   DRACHTIO_PORT (default 9022) = command port — Node.js ↔ drachtio C++ control plane
 *   DRACHTIO_SIP_PORT (default 5060) = SIP port — Plivo → drachtio container (no Node role here)
 */

/** Layer: telephony infrastructure — Drachtio command socket lifecycle; no business logic. */
import Srf from "drachtio-srf";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

/**
 * Shared Srf instance. Created once at module load (no I/O); connection is initiated
 * only when connectToDrachtio() is called from the bootstrap sequence.
 */
export const srf = new Srf();

/**
 * Opens the drachtio command socket to the external drachtio C++ server.
 * Resolves when the "connect" event fires; rejects on error or after 10s timeout.
 *
 * Mirrors the Jambonz sbc-inbound connect pattern:
 *   srf.connect({ host, port, secret }) → srf.on("connect", ...)
 */
export async function connectToDrachtio(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeoutMs = 10_000;
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Drachtio connection timeout after ${timeoutMs}ms ` +
          `(host=${env.drachtioHost} port=${env.drachtioPort})`,
        ),
      );
    }, timeoutMs);

    // srf.connect() is event-based (not Promise-based); fires "connect" on success.
    srf.connect({
      host: env.drachtioHost,
      port: env.drachtioPort,
      secret: env.drachtioSecret,
    });

    srf.once("connect", (err: Error | null, hostport: string) => {
      clearTimeout(timer);
      if (err) {
        logger.error("drachtio_connect_failed", {
          err,
          host: env.drachtioHost,
          port: env.drachtioPort,
          component: "drachtio",
        });
        reject(err);
        return;
      }
      logger.info("drachtio_connected", {
        hostport,
        host: env.drachtioHost,
        commandPort: env.drachtioPort,
        sipPort: env.drachtioSipPort,
        component: "drachtio",
        note: "Drachtio C++ server ready — SIP INVITEs from Plivo on sipPort, control on commandPort",
      });
      resolve();
    });

    srf.once("error", (err: Error) => {
      clearTimeout(timer);
      logger.error("drachtio_socket_error", {
        err,
        host: env.drachtioHost,
        port: env.drachtioPort,
        component: "drachtio",
      });
      reject(err);
    });
  });
}

/** Closes the drachtio command socket. Called on SIGTERM/SIGINT from server.ts. */
export function disconnectFromDrachtio(): void {
  try {
    srf.disconnect();
    logger.info("drachtio_disconnected", { component: "drachtio" });
  } catch (err) {
    logger.error("drachtio_disconnect_error", { err, component: "drachtio" });
  }
}
