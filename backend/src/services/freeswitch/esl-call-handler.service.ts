import { Server as EslServer, Connection } from "modesl";
import { Endpoint, MediaServer } from "drachtio-fsmrf";
import { CallControlService, RecordingMetadata } from "./call-control.service";
import { CallService } from "../../modules/calls/services/call.service";
import { randomUUID } from "crypto";

export interface EslCallHandlerOptions {
  port: number;
  host?: string;
  recordingsDir?: string;
  mediaServer: MediaServer;
}

export class EslCallHandlerService {
  private server: EslServer | null = null;
  private callControl: CallControlService;
  private callService: CallService;
  private mediaServer: MediaServer;
  private port: number;
  private host: string;

  constructor(options: EslCallHandlerOptions) {
    this.port = options.port;
    this.host = options.host || "0.0.0.0";
    this.mediaServer = options.mediaServer;
    this.callControl = new CallControlService(options.recordingsDir);
    this.callService = new CallService();
  }

  async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = new EslServer({ port: this.port, host: this.host }, () => {
          console.log(`ESL outbound server listening on ${this.host}:${this.port}`);
          resolve();
        });

        this.server.on("connection::open", (conn: Connection) => {
          console.log("New ESL connection from FreeSWITCH");
          this.handleConnection(conn).catch((err) => {
            console.error("Error handling ESL connection:", err);
          });
        });

        this.server.on("connection::close", (conn: Connection) => {
          console.log("ESL connection closed");
        });

        this.server.on("error", (err: Error) => {
          console.error("ESL server error:", err);
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private async handleConnection(conn: Connection): Promise<void> {
    let endpoint: Endpoint | null = null;
    let callUuid: string | null = null;
    let callId: string | null = null;

    try {
      await new Promise<void>((resolve) => {
        conn.on("esl::ready", () => {
          console.log("ESL connection ready");
          resolve();
        });
      });

      conn.execute("answer", "", () => {
        console.log("Call answered via ESL");
      });

      conn.subscribe(["CHANNEL_ANSWER", "CHANNEL_HANGUP", "RECORD_STOP", "DTMF"], () => {
        console.log("Subscribed to ESL events");
      });

      conn.api("uuid_dump", (evt) => {
        const body = evt.getBody();
        console.log("Call variables:", body);
        
        const uuidMatch = body.match(/Channel-Call-UUID:\s*([^\s]+)/);
        const fromMatch = body.match(/Caller-Caller-ID-Number:\s*([^\s]+)/);
        const toMatch = body.match(/Caller-Destination-Number:\s*([^\s]+)/);
        
        callUuid = uuidMatch ? uuidMatch[1] : randomUUID();
        const from = fromMatch ? fromMatch[1] : "unknown";
        const to = toMatch ? toMatch[1] : "unknown";

        this.executeCallFlow(conn, callUuid, from, to).catch((err) => {
          console.error("Error executing call flow:", err);
        });
      });

      conn.on("esl::event::CHANNEL_HANGUP::*", () => {
        console.log("Call hung up");
        if (callId) {
          this.callService.setStatus(callId, "hangup", { hangupAt: new Date() }).catch((err) => {
            console.error("Error updating call status to hangup:", err);
          });
          this.callService.setStatus(callId, "completed", { completedAt: new Date() }).catch((err) => {
            console.error("Error updating call status to completed:", err);
          });
        }
      });

      conn.on("esl::end", () => {
        console.log("ESL connection ended");
        if (endpoint) {
          this.callControl.destroyEndpoint(endpoint).catch((err) => {
            console.error("Error destroying endpoint:", err);
          });
        }
      });
    } catch (error) {
      console.error("Error in ESL connection handler:", error);
      if (endpoint) {
        await this.callControl.destroyEndpoint(endpoint).catch(() => {});
      }
    }
  }

  private async executeCallFlow(conn: Connection, callUuid: string, from: string, to: string): Promise<void> {
    let endpoint: Endpoint | null = null;

    try {
      console.log(`Executing call flow for ${callUuid} (${from} -> ${to})`);

      const correlationId = randomUUID();
      const now = new Date();

      const call = await this.callService["callRepository"].create({
        direction: "inbound",
        provider: "freeswitch",
        from,
        to,
        status: "received",
        correlationId,
        providerCallId: callUuid,
        recordingEnabled: true,
        timestamps: { receivedAt: now },
      });

      const callId = call._id.toString();

      await this.callService["pushEvent"](call, "received", { from, to, callUuid });

      const { endpoint: ep } = await this.mediaServer.createEndpoint();
      endpoint = ep;

      await this.callService.setStatus(callId, "answered", { answeredAt: new Date() });
      await this.callService["pushEvent"](call, "answered");

      await this.callControl.sleep(endpoint, 500);

      await this.callControl.playTone(endpoint, 440, 1000);

      await this.callService.setStatus(callId, "played", { playedAt: new Date() });
      await this.callService["pushEvent"](call, "played", { message: "Tone played" });

      await this.callService.setStatus(callId, "recording_started", { recordingStartedAt: new Date() });
      await this.callService["pushEvent"](call, "recording_started");

      const filePath = await this.callControl.startRecording(endpoint, callUuid, async (metadata: RecordingMetadata) => {
        console.log("Recording completed:", metadata);
        
        const recording = await this.callService["recordingRepository"].create({
          callId: call._id,
          provider: "freeswitch",
          providerRecordingId: callUuid,
          status: "completed",
          durationSec: metadata.durationSec,
          filePath: metadata.filePath,
          retrievalUrl: `/api/recordings/local/${callUuid}`,
        });

        await this.callService["callEventRepository"].create({
          callId: call._id,
          correlationId: call.correlationId,
          eventType: "recording_completed",
          payload: { providerRecordingId: callUuid, recordingId: recording._id.toString() },
        });

        console.log("Recording metadata saved to MongoDB");
      });

      await this.callControl.sleep(endpoint, 20000);

      await this.callControl.stopRecording(endpoint, filePath);

      await this.callService.setStatus(callId, "hangup", { hangupAt: new Date() });
      await this.callService["pushEvent"](call, "hangup");

      await this.callControl.hangup(endpoint);

      await this.callService.setStatus(callId, "completed", { completedAt: new Date() });
      await this.callService["pushEvent"](call, "completed");

      console.log(`Call flow completed for ${callUuid}`);
    } catch (error) {
      console.error("Error in call flow execution:", error);
      if (endpoint) {
        await this.callControl.destroyEndpoint(endpoint).catch(() => {});
      }
      throw error;
    }
  }

  close(): void {
    if (this.server) {
      console.log("Closing ESL outbound server");
      this.server.close();
      this.server = null;
    }
  }
}
