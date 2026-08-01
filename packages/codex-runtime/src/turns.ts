import { randomUUID } from "node:crypto";
import { CodexAppServer, RuntimeEvent } from "./json-rpc.js";

export interface TurnOptions { threadId?: string; cwd: string; model: string; effort?: string; serviceTier?: string; input: Array<Record<string, unknown>>; signal?: AbortSignal }
export interface TurnResult { threadId: string; turnId: string; text: string; usage: Record<string, number>; tools: string[]; compactions: number }
export type TurnStreamEvent = { type: "delta"; text: string } | { type: "tool"; name: string } | { type: "completed"; result: TurnResult };

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private values: T[] = []; private waiters: Array<(value: IteratorResult<T>) => void> = []; private done = false; private failure?: Error;
  push(value: T): void { const waiter = this.waiters.shift(); waiter ? waiter({ value, done: false }) : this.values.push(value); }
  close(): void { this.done = true; for (const waiter of this.waiters.splice(0)) waiter({ value: undefined as T, done: true }); }
  fail(error: Error): void { this.failure = error; this.close(); }
  async *[Symbol.asyncIterator](): AsyncIterator<T> { while (true) { if (this.values.length) { yield this.values.shift()!; continue; } if (this.failure) throw this.failure; if (this.done) return; const next = await new Promise<IteratorResult<T>>(resolve => this.waiters.push(resolve)); if (next.done) { if (this.failure) throw this.failure; return; } yield next.value; } }
}

export class CodexTurns {
  constructor(private readonly runtime: CodexAppServer) {}

  async *run(options: TurnOptions): AsyncGenerator<TurnStreamEvent> {
    let threadId = options.threadId;
    if (!threadId) {
      const started = await this.runtime.request<{ thread: { id: string } }>("thread/start", { cwd: options.cwd, model: options.model, approvalPolicy: "never", sandbox: "read-only", ephemeral: false, serviceTier: options.serviceTier ?? null });
      threadId = started.thread.id;
    }
    const response = await this.runtime.request<{ turn: { id: string } }>("turn/start", { threadId, input: options.input, model: options.model, effort: options.effort ?? null, serviceTier: options.serviceTier ?? null, clientUserMessageId: randomUUID() });
    const turnId = response.turn.id; const queue = new AsyncEventQueue<TurnStreamEvent>(); let text = ""; const tools: string[] = []; let compactions = 0; let usage:Record<string,number>={};
    const listener = (event: RuntimeEvent) => {
      const params = (event.params ?? {}) as Record<string, any>;
      if (params.threadId !== threadId || (params.turnId && params.turnId !== turnId)) return;
      if (event.method === "item/agentMessage/delta" && typeof params.delta === "string") { text += params.delta; queue.push({ type: "delta", text: params.delta }); }
      if (event.method === "item/started" && params.item?.type && params.item.type !== "agentMessage") { const name = String(params.item.type); tools.push(name); queue.push({ type: "tool", name }); }
      if (event.method === "context/compacted") compactions++;
      if(event.method==="thread/tokenUsage/updated"){const raw=params.tokenUsage?.last??params.tokenUsage?.total??{};usage={inputTokens:Number(raw.inputTokens??0),outputTokens:Number(raw.outputTokens??0),cachedInputTokens:Number(raw.cachedInputTokens??0),reasoningTokens:Number(raw.reasoningOutputTokens??0),totalTokens:Number(raw.totalTokens??0)}}
      if (event.method === "turn/completed") { queue.push({ type: "completed", result: { threadId: threadId!, turnId, text, usage, tools, compactions } }); queue.close(); }
      if (event.method === "error") queue.fail(new Error(params.message ?? "Codex turn failed"));
    };
    this.runtime.on("event", listener);
    const cancel = () => void this.runtime.request("turn/interrupt", { threadId, turnId }).catch(() => undefined);
    options.signal?.addEventListener("abort", cancel, { once: true });
    try { yield* queue; } finally { this.runtime.off("event", listener); options.signal?.removeEventListener("abort", cancel); if (options.signal?.aborted) cancel(); }
  }
}
