#!/usr/bin/env node
/**
 * Thin process boundary for the unmodified codex-multi-auth governance modules.
 * All ledger normalization, redaction, pricing, summarization and budget decisions
 * below execute upstream code from packages/codex-multi-auth/dist.
 */
import {
  appendUsageLedgerRow,
  hashUsageIdentifier,
  readUsageLedgerRows,
  summarizeUsageRows,
} from "../../../packages/codex-multi-auth/dist/lib/usage/index.js";
import { evaluateBudgetGuard } from "../../../packages/codex-multi-auth/dist/lib/budget-guard.js";

const operation = process.argv[2];
const input = JSON.parse(await new Promise((resolve, reject) => {
  let body = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { body += chunk; });
  process.stdin.on("end", () => resolve(body || "{}"));
  process.stdin.on("error", reject);
}));

async function userSummary({ userId, since, until, by = "model" }) {
  const accountHash = hashUsageIdentifier(userId);
  const rows = (await readUsageLedgerRows({ since, until, includeArchives: true }))
    .filter(row => row.account?.accountHash === accountHash);
  return summarizeUsageRows(rows, { since, until, by });
}

let result;
if (operation === "append") {
  result = await appendUsageLedgerRow({
    source: "local-bridge",
    operation: input.operation ?? "responses",
    outcome: input.outcome ?? "success",
    model: input.model ?? null,
    projectKey: input.projectKey ?? "aiwrapper",
    accountId: input.userId,
    requestId: input.requestId ?? null,
    statusCode: input.statusCode ?? null,
    errorCode: input.errorCode ?? null,
    durationMs: input.durationMs ?? null,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    cachedInputTokens: input.cachedInputTokens ?? 0,
    reasoningTokens: input.reasoningTokens ?? 0,
    totalTokens: input.totalTokens ?? null,
  });
} else if (operation === "summary") {
  result = await userSummary(input);
} else if (operation === "evaluate") {
  const summary = await userSummary(input);
  result = evaluateBudgetGuard({
    key: `user:${input.userId}:${input.label ?? "quota"}`,
    window: input.window ?? "hour",
    maxRequests: input.maxRequests ?? undefined,
    maxTokens: input.maxTokens ?? undefined,
    maxCostUsd: input.maxCostUsd ?? undefined,
    updatedAt: Date.now(),
  }, summary);
} else {
  throw new Error(`Unsupported governance operation: ${operation}`);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
