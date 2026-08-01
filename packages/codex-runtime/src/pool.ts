import { CodexAppServer, AppServerOptions } from "./json-rpc.js";

export class CodexRuntimePool {
  private readonly runtimes = new Map<string, { runtime: CodexAppServer; refs: number; lastUsed: number }>();
  constructor(private readonly factory: (profileId: string) => AppServerOptions | Promise<AppServerOptions>, private readonly maxProcesses = 4) {}

  async acquire(profileId: string): Promise<CodexAppServer> {
    let entry = this.runtimes.get(profileId);
    if (!entry) {
      if (this.runtimes.size >= this.maxProcesses) await this.evictIdle();
      const runtime = new CodexAppServer(await this.factory(profileId));
      await runtime.start(); entry = { runtime, refs: 0, lastUsed: Date.now() }; this.runtimes.set(profileId, entry);
    }
    entry.refs++; entry.lastUsed = Date.now(); return entry.runtime;
  }

  release(profileId: string): void { const entry = this.runtimes.get(profileId); if (entry) { entry.refs = Math.max(0, entry.refs - 1); entry.lastUsed = Date.now(); } }

  async shutdown(): Promise<void> { await Promise.all([...this.runtimes.values()].map(entry => entry.runtime.stop())); this.runtimes.clear(); }

  private async evictIdle(): Promise<void> {
    const idle = [...this.runtimes.entries()].filter(([, value]) => value.refs === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (!idle) throw new Error("All Codex runtimes are busy");
    await idle[1].runtime.stop(); this.runtimes.delete(idle[0]);
  }
}
