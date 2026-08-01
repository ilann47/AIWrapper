import { EventEmitter } from "node:events";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface AppServerOptions { command: string; args?: string[]; env?: NodeJS.ProcessEnv; cwd?: string; requestTimeoutMs?: number }
export interface RuntimeEvent { method: string; params: unknown }

export class CodexAppServer extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private stopping = false;
  private restartAttempt = 0;

  constructor(private readonly options: AppServerOptions) { super(); }

  get alive(): boolean { return Boolean(this.child && !this.child.killed && this.child.exitCode === null); }

  async start(): Promise<void> {
    if (this.alive) return;
    this.stopping = false;
    let command=this.options.command,args=[...(this.options.args??[]),"app-server","--stdio"];
    // npm exposes `codex` as a POSIX shim first on Windows; Node cannot spawn it.
    // Resolve the package entrypoint without a shell to avoid command injection.
    if(process.platform==="win32"&&command==="codex"){
      const entry=join(process.env.APPDATA??"","npm","node_modules","@openai","codex","bin","codex.js");
      if(existsSync(entry)){command=process.execPath;args=[entry,...args]}
    }
    this.child = spawn(command, args, {
      cwd: this.options.cwd, env: { ...process.env, ...this.options.env }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", line => this.handleLine(line));
    this.child.stderr.on("data", data => this.emit("stderr", String(data)));
    this.child.once("exit", (code, signal) => this.handleExit(code, signal));
    await this.request("initialize", { clientInfo: { name: "aiwrapper", title: "AIWrapper", version: "1.0.0" }, capabilities: { experimentalApi: true } });
    this.notify("initialized", {});
    this.restartAttempt = 0;
    this.emit("ready");
  }

  request<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    if (!this.child?.stdin.writable) return Promise.reject(new Error("Codex App Server is not running"));
    const id = ++this.sequence;
    const timeout = this.options.requestTimeoutMs ?? 300_000;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`App Server request timed out: ${method}`)); }, timeout);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.child!.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  notify(method: string, params: unknown = {}): void {
    if (!this.child?.stdin.writable) throw new Error("Codex App Server is not running");
    this.child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    child.stdin.end();
    const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
    const forced = new Promise<void>(resolve => setTimeout(() => { if (child.exitCode === null) child.kill(); resolve(); }, 5_000));
    await Promise.race([exited, forced]);
    this.child = undefined;
  }

  private handleLine(line: string): void {
    let message: Record<string, unknown>;
    try { message = JSON.parse(line) as Record<string, unknown>; } catch { this.emit("protocolError", new Error("Invalid JSON from App Server")); return; }
    if (typeof message.id === "number" && ("result" in message || "error" in message)) {
      const entry = this.pending.get(message.id); if (!entry) return;
      clearTimeout(entry.timer); this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result);
      return;
    }
    if (typeof message.method === "string") this.emit("event", { method: message.method, params: message.params } satisfies RuntimeEvent);
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(`App Server exited (${code ?? signal})`)); }
    this.pending.clear(); this.child = undefined; this.emit("exit", { code, signal });
    if (!this.stopping) {
      const delay = Math.min(30_000, 500 * 2 ** this.restartAttempt++);
      setTimeout(() => void this.start().catch(error => this.emit("restartError", error)), delay).unref();
    }
  }
}
