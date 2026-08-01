/** Adapted and extended from codex-multi-auth lib/budget-guard.ts.
 * Copyright (c) 2026 ndycode, MIT. Source commit 89ca969.
 */
export type BudgetWindow = "hour" | "day" | "week" | "month" | "rolling" | "custom";
export type BudgetMetric = "requests" | "input_tokens" | "output_tokens" | "weighted_units" | "cost_micros" | "duration_ms" | "percent";
export interface BudgetLimit { id: string; subjectType: "user" | "group" | "profile" | "model"; subjectId: string; metric: BudgetMetric; limit: number; mode: "hard" | "soft"; warningPercent: number; tolerance: number; window: BudgetWindow; windowSeconds?: number; model?: string }
export interface UsageTotals { requests: number; input_tokens: number; output_tokens: number; weighted_units: number; cost_micros: number; duration_ms: number; percent: number }
export interface BudgetEvaluation { allowed: boolean; warned: boolean; used: number; limit: number; remaining: number; projected: number; reason?: string }

export function getBudgetWindowStart(window: BudgetWindow, now = Date.now(), windowSeconds?: number): number {
  const date = new Date(now);
  if (window === "rolling" || window === "custom") return now - (windowSeconds ?? 3600) * 1000;
  if (window === "hour") date.setMinutes(0, 0, 0);
  if (window === "day") date.setHours(0, 0, 0, 0);
  if (window === "week") { date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); }
  if (window === "month") { date.setHours(0, 0, 0, 0); date.setDate(1); }
  return date.getTime();
}

export function evaluateBudgetGuard(limit: BudgetLimit, usage: UsageTotals, reservation = 0): BudgetEvaluation {
  const used = usage[limit.metric]; const projected = used + Math.max(0, reservation); const tolerated = limit.limit * (1 + limit.tolerance / 100);
  const exhausted = projected >= tolerated; const warned = projected >= limit.limit * (limit.warningPercent / 100);
  return { allowed: limit.mode === "soft" || !exhausted, warned, used, limit: limit.limit, remaining: Math.max(0, limit.limit - used), projected, reason: exhausted ? `${limit.metric} budget exhausted` : undefined };
}

export function weightedUnits(inputTokens: number, outputTokens: number, cachedTokens = 0, reasoningTokens = 0, outputWeight = 4): number {
  return Math.max(0, inputTokens - cachedTokens) + cachedTokens * 0.25 + outputTokens * outputWeight + reasoningTokens * outputWeight;
}
