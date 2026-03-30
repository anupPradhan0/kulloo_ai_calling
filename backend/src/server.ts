import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { AddressInfo } from "node:net";
import Srf from "drachtio-srf";
import { FreeswitchMrfService } from "./services/freeswitch/freeswitch-mrf.service";
import { EslCallHandlerService } from "./services/freeswitch/esl-call-handler.service";

function listenWithPortFallback(startPort: number, maxAttempts = 10): Promise<void> {
  return new Promise((resolve, reject) => {
    const tryListen = (port: number, attemptsLeft: number): void => {
      const server = app.listen(port);

      server.once("listening", () => {
        const address = server.address() as AddressInfo;
        const activePort = address.port;
        const baseUrl = `http://localhost:${activePort}`;

        // eslint-disable-next-line no-console
        console.log(`Server running on port ${activePort}`);
        // eslint-disable-next-line no-console
        console.log(`Server URL: ${baseUrl}`);
        resolve();
      });

      server.once("error", (error: NodeJS.ErrnoException) => {
        server.close();

        if (error.code === "EADDRINUSE" && attemptsLeft > 1) {
          // eslint-disable-next-line no-console
          console.warn(`Port ${port} is in use, trying ${port + 1}...`);
          tryListen(port + 1, attemptsLeft - 1);
          return;
        }

        reject(error);
      });
    };

    tryListen(startPort, maxAttempts);
  });
}

async function bootstrap(): Promise<void> {
  await connectDatabase();
  
  const freeswitchHost = process.env.FREESWITCH_ESL_HOST || "localhost";
  const freeswitchPort = parseInt(process.env.FREESWITCH_ESL_PORT || "8021", 10);
  const freeswitchPassword = process.env.FREESWITCH_ESL_PASSWORD || "ClueCon";
  const eslOutboundPort = parseInt(process.env.ESL_OUTBOUND_PORT || "3200", 10);
  const recordingsDir = process.env.RECORDINGS_DIR;

  console.log(`Initializing FreeSWITCH ESL connection to ${freeswitchHost}:${freeswitchPort}`);

  const srf = new Srf();
  const freeswitchMrf = new FreeswitchMrfService(srf, {
    host: freeswitchHost,
    port: freeswitchPort,
    secret: freeswitchPassword,
  });

  try {
    const mediaServer = await freeswitchMrf.connect();
    console.log("Connected to FreeSWITCH media server");

    const eslServer = new EslCallHandlerService({
      port: eslOutboundPort,
      host: "0.0.0.0",
      recordingsDir,
      mediaServer,
    });

    await eslServer.listen();
    console.log(`ESL outbound server listening on port ${eslOutboundPort}`);
  } catch (error) {
    console.error("Failed to initialize FreeSWITCH ESL connection:", error);
    console.warn("Continuing without ESL - calls via Plivo XML will not work");
  }

  await listenWithPortFallback(env.port);
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server", error);
  process.exit(1);
});
