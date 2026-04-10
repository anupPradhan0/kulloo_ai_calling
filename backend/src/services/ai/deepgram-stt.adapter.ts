/**
 * Deepgram pre-recorded transcription (WAV/bytes) — fallback path until live fork → streaming STT.
 */

import fs from "node:fs/promises";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export class DeepgramSttAdapter {
  /**
   * Transcribes a WAV (or raw) file; returns empty string if silent / API error (caller may retry).
   */
  async transcribeFile(
    filePath: string,
    options?: { sampleRate?: number; mimetype?: string },
  ): Promise<string> {
    const key = env.deepgramApiKey;
    if (!key) {
      throw new Error("DEEPGRAM_API_KEY is not set");
    }

    const body = await fs.readFile(filePath);
    if (body.length < 256) {
      return "";
    }

    const sr = options?.sampleRate ?? env.aiAudioForkSampleRate;
    const mimetype = options?.mimetype ?? "audio/wav";
    const url = `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&sample_rate=${sr}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": mimetype,
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.error("deepgram_transcribe_http_error", { status: res.status, errText: errText.slice(0, 500) });
      return "";
    }

    const json = (await res.json()) as {
      results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
    };
    const transcript =
      json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
    return transcript;
  }
}
