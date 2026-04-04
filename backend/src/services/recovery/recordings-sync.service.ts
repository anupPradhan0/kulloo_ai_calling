/**
 * Walks the recordings directory on disk and ensures Mongo has a matching Recording row for each WAV tied to a FreeSWITCH call.
 * Helps after restarts or partial writes so the API list endpoints stay consistent with files FreeSWITCH actually produced.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { CallRepository } from "../../modules/calls/repositories/call.repository";
import { RecordingRepository } from "../../modules/calls/repositories/recording.repository";
import { logger } from "../../utils/logger";

/** Tunables for directory path, public URL prefix, timing, and how fresh a file must be before we skip it. */
export interface RecordingsSyncOptions {
  recordingsDir: string;
  publicBaseUrl?: string;
  sweepIntervalMs: number;
  /** Only consider calls/recordings older than this to avoid racing active calls. */
  graceMs: number;
}

export class RecordingsSyncService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly callRepository = new CallRepository();
  private readonly recordingRepository = new RecordingRepository();

  /**
   * @param opts Where to scan WAV files and how often to re-run after startup.
   */
  constructor(private readonly opts: RecordingsSyncOptions) {}

  /**
   * Scans WAV files once, skips tiny or very new files, and upserts recording metadata for known FreeSWITCH channel UUIDs.
   * @param reason Distinguishes the initial run from periodic sweeps for logging only.
   */
  async runOnce(reason: "startup" | "interval" = "startup"): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const dir = path.resolve(this.opts.recordingsDir);
      const cutoff = new Date(Date.now() - this.opts.graceMs);

      let entries: string[] = [];
      try {
        entries = await fs.readdir(dir);
      } catch {
        return;
      }

      const wavs = entries.filter((f) => f.toLowerCase().endsWith(".wav"));
      for (const filename of wavs) {
        const uuid = filename.replace(/\.wav$/i, "");
        const filePath = path.join(dir, filename);

        try {
          const st = await fs.stat(filePath);
          // Skip files still being written or touched recently so we do not attach half-written media to a call.
          if (st.mtime > cutoff) continue;
          // Empty or header-only WAVs are not useful recordings; skip to avoid polluting Mongo.
          if (st.size <= 44) continue;
        } catch {
          continue;
        }

        const call = await this.callRepository.findFreeswitchCallByChannelUuid(uuid);
        if (!call) continue;

        const retrievalUrl = this.opts.publicBaseUrl
          ? `${this.opts.publicBaseUrl.replace(/\/+$/, "")}/api/recordings/local/${uuid}`
          : `/api/recordings/local/${uuid}`;

        await this.recordingRepository.upsertFreeswitchRecordingFromDiskSync({
          providerRecordingId: uuid,
          callId: call._id,
          filePath,
          retrievalUrl,
        });
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Schedules runOnce on an interval; skips when interval is zero or negative.
   */
  start(): void {
    if (this.timer) return;
    if (this.opts.sweepIntervalMs <= 0) return;
    this.timer = setInterval(() => {
      this.runOnce("interval").catch((err: unknown) => {
        logger.error("recordings_sync_sweep_failed", { err });
      });
    }, this.opts.sweepIntervalMs);
  }

  /**
   * Stops the periodic directory scan.
   */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
