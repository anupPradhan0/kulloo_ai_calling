/**
 * Node process entry: connects MongoDB, verifies Redis, starts the FreeSWITCH Event Socket listener and recovery timers, then serves HTTP.
 * Boot order matters because ESL and HTTP handlers assume the database and Redis clients are ready before accepting traffic.
 * Graceful shutdown hooks disconnect Redis when the process receives SIGTERM or SIGINT.
 */

import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { AddressInfo } from "node:net";
import type { EslCallHandlerService } from "./services/freeswitch/esl-call-handler.service";
import { OrphanCallsRecoveryService } from "./services/recovery/orphan-calls-recovery.service";
import { RecordingsSyncService } from "./services/recovery/recordings-sync.service";
import { logger } from "./utils/logger";
import { assertRedisAvailable, disconnectRedis } from "./services/redis/redis.client";
import { createCallControlBackend } from "./services/call-control/call-control-backend.factory";
import type { CallControlBackend } from "./services/call-control/call-control-backend.interface";

function shutdownRedis(): void {
  void disconnectRedis().catch(() => undefined);
}

process.once("SIGTERM", shutdownRedis);
process.once("SIGINT", shutdownRedis);

/**
 * Binds the HTTP server to the configured port, or tries the next ports when the address is already in use (local dev convenience).
 * @param startPort First port to try from configuration.
 * @param maxAttempts How many consecutive ports to try before failing.
 */
function listenWithPortFallback(startPort: number, maxAttempts = 10): Promise<void> {
  return new Promise((resolve, reject) => {
    const tryListen = (port: number, attemptsLeft: number): void => {
      const server = app.listen(port);

      server.once("listening", () => {
        const address = server.address() as AddressInfo;
        const activePort = address.port;
        const baseUrl = `http://localhost:${activePort}`;

        logger.info("http_server_listening", { port: activePort, baseUrl });
        resolve();
      });

      server.once("error", (error: NodeJS.ErrnoException) => {
        server.close();

        if (error.code === "EADDRINUSE" && attemptsLeft > 1) {
          logger.warn("http_server_port_in_use", { port, trying: port + 1 });
          tryListen(port + 1, attemptsLeft - 1);
          return;
        }

        reject(error);
      });
    };

    tryListen(startPort, maxAttempts);
  });
}

/**
 * Runs all startup side effects in order: database, Redis ping, ESL TCP server, orphan and recording sync jobs, then HTTP listen.
 * Dynamic-imports the ESL handler so heavy telephony code loads after core configuration is validated.
 */
async function bootstrap(): Promise<void> {
  await connectDatabase();
  await assertRedisAvailable();

  const eslOutboundPort = env.eslOutboundPort;
  const recordingsDir = env.recordingsDirRaw ?? "/recordings";
  const orphanGraceMs = env.orphanGraceMs;
  const orphanSweepIntervalMs = env.orphanSweepIntervalMs;
  const recordingsSyncGraceMs = env.recordingsSyncGraceMs;
  const recordingsSyncIntervalMs = env.recordingsSyncIntervalMs;
  const publicBaseUrl = env.publicBaseUrl;

  logger.info("bootstrap_starting_esl_server", { eslOutboundPort });

  // ESL outbound server - FreeSWITCH connects TO this
  // No need to connect TO FreeSWITCH first in outbound mode
  const { EslCallHandlerService: EslHandler } = await import("./services/freeswitch/esl-call-handler.service");
  
  const eslServer: EslCallHandlerService = new EslHandler({
    port: eslOutboundPort,
    host: "0.0.0.0",
    recordingsDir,
    mediaServer: null, // Not needed for ESL outbound mode
  });

  // Crash/restart recovery: finalize orphan calls from previous runs.
  const recovery = new OrphanCallsRecoveryService({
    graceMs: orphanGraceMs,
    sweepIntervalMs: orphanSweepIntervalMs,
    getActiveProviderCallIds: () => eslServer.getActiveProviderCallIds(),
  });
  await recovery.runOnce("startup");
  recovery.start();

  // Backfill recordings in MongoDB from local WAVs on disk (idempotent upsert).
  const recordingsSync = new RecordingsSyncService({
    recordingsDir,
    publicBaseUrl,
    graceMs: recordingsSyncGraceMs,
    sweepIntervalMs: recordingsSyncIntervalMs,
  });
  await recordingsSync.runOnce("startup");
  recordingsSync.start();

  await eslServer.listen();
  logger.info("bootstrap_esl_ready", {
    eslOutboundPort,
    note: "FreeSWITCH connects inbound to this port",
  });

  // Call-control backend: selects Flow A (default) or Flow B (Drachtio) based on env var.
  // Flow A: no-op — Kamailio handles SIP, ESL handles media. Unchanged.
  // Flow B: connects to external drachtio C++ server and registers the SIP INVITE handler.
  const callControlBackend: CallControlBackend = createCallControlBackend();
  await callControlBackend.start();

  // Shutdown hook: stop call-control backend alongside Redis on SIGTERM/SIGINT.
  const shutdownCallControl = (): void => {
    void callControlBackend.stop().catch(() => undefined);
  };
  process.once("SIGTERM", shutdownCallControl);
  process.once("SIGINT", shutdownCallControl);

  await listenWithPortFallback(env.port);
}

bootstrap().catch((error: unknown) => {
  logger.error("bootstrap_failed", { err: error });
  process.exit(1);
});
