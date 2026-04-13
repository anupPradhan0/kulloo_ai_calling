/**
 * Maintains a WebSocket server attached to the existing HTTP server.
 * The frontend Agent page connects here to receive real-time call lifecycle events
 * without requiring a separate port — it upgrades on the path /ws/agent.
 *
 * Events broadcast to all connected agents:
 *   inbound_call.offered  — when a new PSTN call arrives and ESL has answered it
 *   call.answered         — when the agent accepts the bridge
 *   call.ended            — when the bridged session terminates
 *
 * v1: no authentication — server-side deployment only.
 * Future: add JWT or cookie validation in the 'upgrade' handler.
 */

/** Layer: telephony infrastructure — realtime event fanout to agent browsers. */
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import { logger } from "../../utils/logger";

/** Typed events streamed to each connected agent browser. */
export type AgentWsEvent =
  | { type: "inbound_call.offered"; callId: string; from: string; to: string; calledAt: string }
  | { type: "call.answered";        callId: string }
  | { type: "call.ended";           callId: string; reason: string };

/** Attaches a WebSocket server to an existing HTTP server and provides broadcast. */
export class AgentWsService {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(httpServer: HttpServer) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: "/ws/agent",
      // Avoid permessage-deflate behind nginx / some browsers — mismatches can drop the socket right after open (client sees 1006).
      perMessageDeflate: false,
    });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.clients.add(ws);
      const ip = req.socket.remoteAddress ?? "unknown";
      logger.info("agent_ws_client_connected", { component: "agent-ws", ip, totalClients: this.clients.size });

      // Send a welcome ping so the client knows the connection is live.
      ws.send(JSON.stringify({ type: "connected" }));

      ws.on("message", (data: unknown) => {
        // Forward pings from the browser as pongs (connection keepalive).
        const msg = String(data);
        if (msg === "ping") {
          ws.send("pong");
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        logger.info("agent_ws_client_disconnected", { component: "agent-ws", ip, totalClients: this.clients.size });
      });

      ws.on("error", (err: Error) => {
        logger.error("agent_ws_client_error", { component: "agent-ws", err });
        this.clients.delete(ws);
      });
    });

    this.wss.on("error", (err: Error) => {
      logger.error("agent_ws_server_error", { component: "agent-ws", err });
    });

    logger.info("agent_ws_server_attached", { component: "agent-ws", path: "/ws/agent" });
  }

  /** Serialize and send an event to every currently connected agent browser. */
  broadcast(event: AgentWsEvent): void {
    const payload = JSON.stringify(event);
    let sent = 0;
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
        sent++;
      }
    }
    logger.info("agent_ws_broadcast", {
      component: "agent-ws",
      eventType: event.type,
      sentTo: sent,
      totalClients: this.clients.size,
    });
  }

  /** Number of currently connected browsers (useful for metrics). */
  get connectionCount(): number {
    return this.clients.size;
  }

  /** Gracefully close all connections and the WSS (called on SIGTERM). */
  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.wss.close();
    logger.info("agent_ws_server_closed", { component: "agent-ws" });
  }
}
