import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
export const registry = new Registry(); collectDefaultMetrics({ register: registry, prefix: "aiwrapper_" });
export const requestDuration = new Histogram({ name: "aiwrapper_request_duration_seconds", help: "Request execution duration", labelNames: ["backend", "model", "outcome"], registers: [registry] });
export const requestTokens = new Counter({ name: "aiwrapper_tokens_total", help: "Tokens recorded", labelNames: ["kind", "backend", "model"], registers: [registry] });
export const quotaBlocks = new Counter({ name: "aiwrapper_quota_blocks_total", help: "Quota blocks", labelNames: ["metric", "subject_type"], registers: [registry] });
export const queueDepth = new Gauge({ name: "aiwrapper_queue_depth", help: "Queued requests", registers: [registry] });
export const runtimeProcesses = new Gauge({ name: "aiwrapper_runtime_processes", help: "Active Codex App Server processes", registers: [registry] });
