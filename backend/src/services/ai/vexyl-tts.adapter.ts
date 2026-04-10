/**
 * VEXYL-TTS WebSocket client — returns WAV bytes (buffer handover per plan).
 */

import WebSocket from "ws";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

interface VexylAudioMessage {
  type: string;
  request_id?: string;
  audio_b64?: string;
  sample_rate?: number;
  message?: string;
}

export class VexylTtsAdapter {
  async synthesize(text: string): Promise<{ wav: Buffer; sampleRate: number }> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("VEXYL synthesize: empty text");
    }

    const url = env.vexylTtsWsUrl;
    return await new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        headers: env.optionalVexylTtsApiKey
          ? { "X-API-Key": env.optionalVexylTtsApiKey }
          : undefined,
      });

      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("VEXYL TTS WebSocket timeout"));
      }, 120_000);

      const requestId = `kulloo_${Date.now()}`;

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "synthesize",
            text: trimmed,
            lang: env.vexylTtsLang,
            style: env.vexylTtsStyle,
            request_id: requestId,
          }),
        );
      });

      ws.on("message", (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(String(data)) as VexylAudioMessage;
          if (msg.type === "ready" || msg.type === "pong") {
            return;
          }
          if (msg.type === "audio" && msg.audio_b64) {
            const wav = Buffer.from(msg.audio_b64, "base64");
            const sr = msg.sample_rate ?? env.aiPlaybackSampleRate;
            clearTimeout(timer);
            ws.close();
            resolve({ wav, sampleRate: sr });
            return;
          }
          if (msg.type === "error") {
            clearTimeout(timer);
            ws.close();
            reject(new Error(msg.message ?? "VEXYL error"));
          }
        } catch (e) {
          logger.error("vexyl_ws_parse_error", { err: e });
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
