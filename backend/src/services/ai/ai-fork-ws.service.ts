/**
 * Placeholder WebSocket ingress for FreeSWITCH audio-fork / media-tap frames → future Deepgram live.
 * Upgrade path: accept binary PCM/μ-law from FS and forward to Deepgram streaming (Phase 2+).
 */

import type { Server as HttpServer } from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { logger } from "../../utils/logger";

export class AiForkWsService {
  private wss: WebSocketServer | null = null;

  /** Uses noServer mode and manually handles upgrade to avoid Express interference. */
  attach(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
    });

    httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = new URL(req.url || "/", `http://${req.headers.host}`).pathname;

      if (pathname === "/internal/ai-audio-fork") {
        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          this.wss!.emit("connection", ws, req);
        });
      }
      // Other paths are handled by AgentWsService or ignored
    });

    this.wss.on("connection", (ws) => {
      logger.info("ai_audio_fork_ws_connected", { note: "stub — binary frames not yet routed to Deepgram" });
      ws.on("message", (data) => {
        void data;
      });
      ws.on("error", () => undefined);
    });
  }

  close(): void {
    this.wss?.close();
    this.wss = null;
  }
}
