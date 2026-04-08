/**
 * Node process entry: connects MongoDB, verifies Redis, starts the FreeSWITCH Event Socket listener,
 * attaches the agent WebSocket server, starts recovery timers, then serves HTTP.
 * Boot order matters because ESL and HTTP handlers assume the database and Redis clients are ready.
 * Graceful shutdown hooks disconnect Redis and close the WS server on SIGTERM or SIGINT.
 */

import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { AddressInfo } from "node:net";
import http from "node:http";
import type { EslCallHandlerService } from "./services/freeswitch/esl-call-handler.service";
import { OrphanCallsRecoveryService } from "./services/recovery/orphan-calls-recovery.service";
import { RecordingsSyncService } from "./services/recovery/recordings-sync.service";
import { logger } from "./utils/logger";
import { assertRedisAvailable, disconnectRedis } from "./services/redis/redis.client";
import { createCallControlBackend } from "./services/call-control/call-control-backend.factory";
import type { CallControlBackend } from "./services/call-control/call-control-backend.interface";
import { AgentWsService } from "./services/agent/agent-ws.service";

function shutdownRedis(): void {
  void disconnectRedis().catch(() => undefined);
}

process.once("SIGTERM", shutdownRedis);
process.once("SIGINT", shutdownRedis);

/**
 * Binds the provided http.Server to the configured port (with port fallback for local dev).
 * Returns when listening, rejects on bind errors.
 */
function listenWithPortFallback(
  httpServer: http.Server,
  startPort: number,
  maxAttempts = 10,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tryListen = (port: number, attemptsLeft: number): void => {
      httpServer.listen(port);

      httpServer.once("listening", () => {
        const address = httpServer.address() as AddressInfo;
        const activePort = address.port;
        const baseUrl = `http://localhost:${activePort}`;

        logger.info("http_server_listening", { port: activePort, baseUrl });
        resolve();
      });

      httpServer.once("error", (error: NodeJS.ErrnoException) => {
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
 * Runs all startup side effects in order:
 *   1. MongoDB connection
 *   2. Redis verification
 *   3. Create http.Server + attach AgentWsService at /ws/agent
 *   4. ESL outbound server (FreeSWITCH connects here)
 *   5. Orphan / recording sync jobs
 *   6. Call-control backend (Flow A default, or Flow B Drachtio)
 *   7. HTTP+WS listen
 */
async function bootstrap(): Promise<void> {
  await connectDatabase();
  await assertRedisAvailable();

  const eslOutboundPort      = env.eslOutboundPort;
  const recordingsDir        = env.recordingsDirRaw ?? "/recordings";
  const orphanGraceMs        = env.orphanGraceMs;
  const orphanSweepIntervalMs = env.orphanSweepIntervalMs;
  const recordingsSyncGraceMs = env.recordingsSyncGraceMs;
  const recordingsSyncIntervalMs = env.recordingsSyncIntervalMs;
  const publicBaseUrl        = env.publicBaseUrl;

  // Create the raw http.Server from Express so we can attach the WS server to it.
  const httpServer = http.createServer(app);

  // Agent WebSocket server (/ws/agent) — attaches to httpServer before listen starts.
  const agentWs = new AgentWsService(httpServer);

  logger.info("bootstrap_starting_esl_server", { eslOutboundPort, agentMode: env.agentMode });

  // ESL outbound server — FreeSWITCH connects TO this (outbound ESL pattern).
  const { EslCallHandlerService: EslHandler } = await import("./services/freeswitch/esl-call-handler.service");

  const eslServer: EslCallHandlerService = new EslHandler({
    port: eslOutboundPort,
    host: "0.0.0.0",
    recordingsDir,
    mediaServer: null,
    // Inject AgentWsService so ESL can broadcast inbound_call.offered / call.ended.
    agentWs,
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

  // Shutdown hooks.
  const shutdownCallControl = (): void => {
    void callControlBackend.stop().catch(() => undefined);
  };
  const shutdownAgentWs = (): void => { agentWs.close(); };

  process.once("SIGTERM", shutdownCallControl);
  process.once("SIGINT",  shutdownCallControl);
  process.once("SIGTERM", shutdownAgentWs);
  process.once("SIGINT",  shutdownAgentWs);

  // Start HTTP (and attached WebSocket) server.
  await listenWithPortFallback(httpServer, env.port);
}

bootstrap().catch((error: unknown) => {
  logger.error("bootstrap_failed", { err: error });
  process.exit(1);
});
