/**
 * Holds simple in-process counters and an active-call gauge updated by ESL and HTTP layers for quick operational visibility.
 * Values reset when the process restarts; this is not a long-term metrics store like Prometheus by itself.
 */

/** Names of increment-only counters exposed in the metrics snapshot JSON. */
export type CounterName =
  | "failedCalls"
  | "recordingFailed"
  | "dtmfCount"
  | "redisIdempotencyHits"
  | "redisIdempotencyMisses"
  | "webhookDedupeSkips";

export class MetricsService {
  private activeCalls = 0;
  private counters: Record<CounterName, number> = {
    failedCalls: 0,
    recordingFailed: 0,
    dtmfCount: 0,
    redisIdempotencyHits: 0,
    redisIdempotencyMisses: 0,
    webhookDedupeSkips: 0,
  };

  /**
   * Increments the number of calls currently executing inside ESL executeCallFlow (paired with dec on completion).
   */
  incActiveCalls(): void {
    this.activeCalls += 1;
  }

  /**
   * Decrements active calls and never goes below zero when paths double-count or race.
   */
  decActiveCalls(): void {
    this.activeCalls = Math.max(0, this.activeCalls - 1);
  }

  /**
   * Adds to a named counter used in idempotency, webhooks, or failure tracking.
   * @param name Which counter to bump.
   * @param by Amount to add (defaults to 1).
   */
  incCounter(name: CounterName, by = 1): void {
    this.counters[name] += by;
  }

  /**
   * Returns a plain object suitable for JSON serialization at GET /api/metrics.
   */
  snapshot(): {
    activeCalls: number;
    failedCalls: number;
    recordingFailed: number;
    dtmfCount: number;
    redisIdempotencyHits: number;
    redisIdempotencyMisses: number;
    webhookDedupeSkips: number;
  } {
    return {
      activeCalls: this.activeCalls,
      failedCalls: this.counters.failedCalls,
      recordingFailed: this.counters.recordingFailed,
      dtmfCount: this.counters.dtmfCount,
      redisIdempotencyHits: this.counters.redisIdempotencyHits,
      redisIdempotencyMisses: this.counters.redisIdempotencyMisses,
      webhookDedupeSkips: this.counters.webhookDedupeSkips,
    };
  }
}

/** Shared singleton used across modules so all increments land in one place. */
export const metrics = new MetricsService();
