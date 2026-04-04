/**
 * Periodically finds call documents stuck in non-terminal states after a crash or deploy and marks them failed or completed.
 * Skips provider call ids that the ESL handler reports as still active so live calls are not incorrectly closed.
 */

import { CallRepository } from "../../modules/calls/repositories/call.repository";
import { logger } from "../../utils/logger";

/** Configuration for how old a row must be before it is eligible and how often to sweep. */
export interface OrphanRecoveryOptions {
  graceMs: number;
  sweepIntervalMs: number;
  /**
   * A function returning providerCallIds currently active in this process.
   * These calls will be excluded from periodic sweeps.
   */
  getActiveProviderCallIds?: () => ReadonlySet<string>;
}

type NonTerminalStatus =
  | "received"
  | "initiated"
  | "answered"
  | "connected"
  | "played"
  | "recording_started"
  | "hangup";

const NON_TERMINAL_STATUSES: NonTerminalStatus[] = [
  "received",
  "initiated",
  "answered",
  "connected",
  "played",
  "recording_started",
  "hangup",
];

// Hangup is handled separately: stale hangup rows move to completed instead of failed.
const STATUSES_TO_FAIL = NON_TERMINAL_STATUSES.filter((s) => s !== "hangup");

export class OrphanCallsRecoveryService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly callRepository = new CallRepository();

  /**
   * @param opts Grace period, interval, and optional active-call filter from ESL.
   */
  constructor(private readonly opts: OrphanRecoveryOptions) {}

  /**
   * Runs one sweep immediately: completes stale hangups and fails other stale non-terminal calls, optionally excluding active channels.
   * @param reason startup runs before interval sweeps; interval runs from the timer.
   */
  async runOnce(reason: "startup" | "interval" = "startup"): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const cutoff = new Date(Date.now() - this.opts.graceMs);
      const activeSet =
        reason === "interval" ? this.opts.getActiveProviderCallIds?.() : undefined;

      await this.callRepository.sweepStaleHangupToCompleted(cutoff, activeSet);
      await this.callRepository.sweepStaleNonTerminalToFailed(cutoff, activeSet, STATUSES_TO_FAIL);
    } finally {
      this.running = false;
    }
  }

  /**
   * Starts a repeating timer that calls runOnce on the configured interval; no-op when interval is zero or negative.
   */
  start(): void {
    if (this.timer) return;
    if (this.opts.sweepIntervalMs <= 0) return;
    this.timer = setInterval(() => {
      this.runOnce("interval").catch((err: unknown) => {
        logger.error("orphan_call_recovery_sweep_failed", { err });
      });
    }, this.opts.sweepIntervalMs);
  }

  /**
   * Clears the interval timer so tests or shutdown can stop background work.
   */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
