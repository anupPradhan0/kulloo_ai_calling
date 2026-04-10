/**
 * Placeholder WebSocket ingress for FreeSWITCH audio-fork / media-tap frames → future Deepgram live.
 * Upgrade path: accept binary PCM/μ-law from FS and forward to Deepgram streaming (Phase 2+).
 */

import type { Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import { logger } from "../../utils/logger";

export class AiForkWsService {
  private wss: WebSocketServer | null = null;

  /** Same pattern as AgentWsService: attach with explicit path (no custom http `upgrade` listener). */
  attach(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: "/internal/ai-audio-fork",
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
