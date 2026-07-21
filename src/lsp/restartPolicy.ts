const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_DELAYS = [0, 1000, 3000, 10000];

export class RestartPolicy {
  private failures: number[] = [];
  private readonly windowMs: number;
  private readonly delays: readonly number[];

  constructor(windowMs = DEFAULT_WINDOW_MS, delays = DEFAULT_DELAYS) {
    this.windowMs = windowMs;
    this.delays = delays;
  }

  public recordFailure(now: number = Date.now()): number | undefined {
    const cutoff = now - this.windowMs;
    this.failures = this.failures.filter((t) => t > cutoff);
    this.failures.push(now);

    const index = this.failures.length - 1;
    if (index < this.delays.length) {
      return this.delays[index];
    }
    return undefined;
  }

  public reset(): void {
    this.failures = [];
  }
}
