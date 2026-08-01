/**
 * AIWrapper adapter around the unmodified codex-multi-auth budget guard.
 *
 * Community implementation (MIT):
 * upstream/codex-multi-auth/lib/budget-guard.ts @ 89ca9696
 *
 * IMPLEMENTAÇÃO PRÓPRIA: only the PostgreSQL metric/rolling-window adapter and
 * weighted subscription units below. Calendar-window calculation and the hard/
 * soft allow decision execute the upstream module directly.
 */
import {
  evaluateBudgetGuard as evaluateCommunityBudgetGuard,
  getBudgetWindowStart as getCommunityBudgetWindowStart,
  type BudgetLimit as CommunityBudgetLimit,
} from "../../../upstream/codex-multi-auth/lib/budget-guard.js";

export type BudgetWindow = "hour" | "day" | "week" | "month" | "rolling" | "custom";
export type BudgetMetric = "requests" | "input_tokens" | "output_tokens" | "weighted_units" | "cost_micros" | "duration_ms" | "percent";
export interface BudgetLimit { id: string; subjectType: "user" | "group" | "profile" | "model"; subjectId: string; metric: BudgetMetric; limit: number; mode: "hard" | "soft"; warningPercent: number; tolerance: number; window: BudgetWindow; windowSeconds?: number; model?: string }
export interface UsageTotals { requests: number; input_tokens: number; output_tokens: number; weighted_units: number; cost_micros: number; duration_ms: number; percent: number }
export interface BudgetEvaluation { allowed: boolean; warned: boolean; used: number; limit: number; remaining: number; projected: number; reason?: string }

export function getBudgetWindowStart(window: BudgetWindow, now = Date.now(), windowSeconds?: number): number {
  if (window === "rolling" || window === "custom") return now - (windowSeconds ?? 3600) * 1000;
  return getCommunityBudgetWindowStart(window, now);
}

export function evaluateBudgetGuard(limit: BudgetLimit, usage: UsageTotals, reservation = 0): BudgetEvaluation {
  const used = usage[limit.metric];
  const projected = used + Math.max(0, reservation);
  const toleratedLimit = limit.limit * (1 + limit.tolerance / 100);
  const communityLimit: CommunityBudgetLimit = {
    key: `${limit.subjectType}:${limit.subjectId}:${limit.metric}`,
    window: limit.window === "rolling" || limit.window === "custom" ? "hour" : limit.window,
    updatedAt: Date.now(),
    ...(limit.metric === "requests" ? { maxRequests: toleratedLimit } : {}),
    ...(limit.metric === "cost_micros" ? { maxCostUsd: toleratedLimit / 1_000_000 } : {}),
    ...(!new Set<BudgetMetric>(["requests", "cost_micros"]).has(limit.metric) ? { maxTokens: toleratedLimit } : {}),
  };
  const decision = evaluateCommunityBudgetGuard(communityLimit, {
    since: null,
    until: null,
    by: "account",
    totals: {
      key: communityLimit.key,
      requests: limit.metric === "requests" ? projected : 0,
      successes: 0,
      failures: 0,
      blocked: 0,
      cancelled: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      totalTokens: !new Set<BudgetMetric>(["requests", "cost_micros"]).has(limit.metric) ? projected : 0,
      costUsd: limit.metric === "cost_micros" ? projected / 1_000_000 : 0,
    },
    buckets: [],
  });
  const exhausted = !decision.allowed;
  return {
    allowed: limit.mode === "soft" || !exhausted,
    warned: projected >= limit.limit * (limit.warningPercent / 100),
    used,
    limit: limit.limit,
    remaining: Math.max(0, limit.limit - used),
    projected,
    reason: exhausted ? decision.reasons.join("; ") : undefined,
  };
}

/** IMPLEMENTAÇÃO PRÓPRIA: subscription-relative units are not an upstream concept. */
export function weightedUnits(inputTokens: number, outputTokens: number, cachedTokens = 0, reasoningTokens = 0, outputWeight = 4): number {
  return Math.max(0, inputTokens - cachedTokens) + cachedTokens * 0.25 + outputTokens * outputWeight + reasoningTokens * outputWeight;
}
