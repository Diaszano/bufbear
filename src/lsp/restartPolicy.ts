const DEFAULT_DELAYS = [0, 1000, 3000, 10000] as const;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

export class RestartPolicy {
  private failures: number[] = [];

  public constructor(
    private readonly windowMs: number = DEFAULT_WINDOW_MS,
    private readonly delays: readonly number[] = DEFAULT_DELAYS
  ) {}

  public recordFailure(now: number = Date.now()): number | undefined {
    this.failures = this.failures.filter((t) => now - t < this.windowMs);
    this.failures.push(now);
    return this.delays[this.failures.length - 1];
  }

  public reset(): void {
    this.failures.length = 0;
  }
}
