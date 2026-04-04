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

  incActiveCalls(): void {
    this.activeCalls += 1;
  }

  decActiveCalls(): void {
    this.activeCalls = Math.max(0, this.activeCalls - 1);
  }

  incCounter(name: CounterName, by = 1): void {
    this.counters[name] += by;
  }

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

export const metrics = new MetricsService();

