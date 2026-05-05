export class TokenBucketLimiter {
  private tokens: number;
  private waiters: Array<() => void> = [];
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly capacity: number,
    private readonly refillIntervalMs: number,
  ) {
    this.tokens = capacity;
    this.startRefill();
  }

  async acquire(): Promise<void> {
    if (this.tokens > 0) {
      this.tokens -= 1;
      return;
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private startRefill(): void {
    this.timer = setInterval(() => {
      this.tokens = this.capacity;
      while (this.tokens > 0 && this.waiters.length > 0) {
        const next = this.waiters.shift()!;
        this.tokens -= 1;
        next();
      }
    }, this.refillIntervalMs);
    this.timer.unref?.();
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
