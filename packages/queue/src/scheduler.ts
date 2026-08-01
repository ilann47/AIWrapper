export interface QueueJob<T> { id: string; userId: string; model: string; priority: number; enqueuedAt: number; signal?: AbortSignal; run(signal: AbortSignal): Promise<T> }
export class FairScheduler {
  private queue: Array<QueueJob<unknown>> = []; private active = 0; private activeByUser = new Map<string, number>();
  constructor(private readonly globalLimit: number, private readonly perUserLimit: number, private readonly queueTimeoutMs: number) {}
  submit<T>(job: QueueJob<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrapped: QueueJob<unknown> = { ...job, run: async signal => job.run(signal).then(resolve, reject) };
      this.queue.push(wrapped); this.queue.sort((a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt);
      const timer = setTimeout(() => { const i = this.queue.indexOf(wrapped); if (i >= 0) { this.queue.splice(i, 1); reject(new Error("Queue timeout")); } }, this.queueTimeoutMs);
      job.signal?.addEventListener("abort", () => { clearTimeout(timer); const i = this.queue.indexOf(wrapped); if (i >= 0) this.queue.splice(i, 1); reject(job.signal?.reason ?? new Error("Cancelled")); }, { once: true });
      const original = wrapped.run; wrapped.run = async signal => { clearTimeout(timer); return original(signal); }; this.drain();
    });
  }
  get depth(): number { return this.queue.length; }
  private drain(): void {
    while (this.active < this.globalLimit) {
      const index = this.queue.findIndex(job => (this.activeByUser.get(job.userId) ?? 0) < this.perUserLimit);
      if (index < 0) return; const job = this.queue.splice(index, 1)[0]!; const controller = new AbortController();
      this.active++; this.activeByUser.set(job.userId, (this.activeByUser.get(job.userId) ?? 0) + 1);
      void job.run(controller.signal).finally(() => { this.active--; this.activeByUser.set(job.userId, Math.max(0, (this.activeByUser.get(job.userId) ?? 1) - 1)); this.drain(); });
    }
  }
}
