/** Adapted from codex-multi-auth lib/usage/types.ts.
 * Copyright (c) 2026 ndycode, MIT. Source commit 89ca969.
 */
export type LedgerOutcome = "success" | "error" | "cancelled" | "blocked";
export interface UsageLedgerRow {
  id: string; idempotencyKey: string; requestId: string; userId: string; sessionId?: string; deviceId?: string;
  profileId: string; backendId: string; model: string; startedAt: Date; finishedAt: Date; durationMs: number;
  outcome: LedgerOutcome; inputTokens: number; outputTokens: number; cachedInputTokens: number; reasoningTokens: number;
  calls: number; compactions: number; tools: string[]; tasks: string[]; errorCode?: string; estimatedCostMicros: number;
  weightedUnits: number; measurementSource: "provider" | "codex" | "estimated"; confidence: "exact" | "high" | "medium" | "low";
}

export function redactLedgerRow(row: UsageLedgerRow): UsageLedgerRow {
  return { ...row, tools: [...new Set(row.tools.map(tool => tool.slice(0, 80)))], tasks: row.tasks.map(() => "[redacted]") };
}
