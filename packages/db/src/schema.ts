import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const userStatus = pgEnum("user_status", ["active", "suspended", "blocked"]);
export const userRole = pgEnum("user_role", ["user", "operator", "admin", "owner"]);
export const outcome = pgEnum("request_outcome", ["queued", "running", "success", "error", "cancelled", "blocked"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(), status: userStatus("status").notNull().default("active"), role: userRole("role").notNull().default("user"), groupId: uuid("group_id"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("users_name_uq").on(table.name)]);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), prefix: text("prefix").notNull(), digest: text("digest").notNull(), status: text("status").notNull().default("active"), createdAt: timestamp("created_at", { withTimezone: true }).notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }), revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, table => [uniqueIndex("api_keys_digest_uq").on(table.digest), index("api_keys_user_idx").on(table.userId)]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id), name: text("name").notNull(), codexHome: text("codex_home").notNull(), backendId: text("backend_id").notNull(), status: text("status").notNull().default("active"), config: jsonb("config").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("profiles_user_name_uq").on(table.userId, table.name)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").notNull().references(() => users.id), profileId: uuid("profile_id").notNull().references(() => profiles.id), codexThreadId: text("codex_thread_id"), title: text("title").notNull(), model: text("model").notNull(), status: text("status").notNull().default("active"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("sessions_user_updated_idx").on(table.userId, table.updatedAt)]);

export const usageCycles = pgTable("usage_cycles", {
  id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull(), kind: text("kind").notNull(), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true }), windowSeconds: integer("window_seconds"), status: text("status").notNull().default("active"), metadata: jsonb("metadata").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const budgetLimits = pgTable("budget_limits", {
  id: uuid("id").primaryKey().defaultRandom(), cycleId: uuid("cycle_id").notNull().references(() => usageCycles.id), subjectType: text("subject_type").notNull(), subjectId: uuid("subject_id"), model: text("model"), metric: text("metric").notNull(), limitValue: bigint("limit_value", { mode: "number" }).notNull(), mode: text("mode").notNull(), warningPercent: integer("warning_percent").notNull().default(80), toleranceBasisPoints: integer("tolerance_basis_points").notNull().default(0), enabled: boolean("enabled").notNull().default(true),
}, table => [index("budget_subject_idx").on(table.subjectType, table.subjectId, table.cycleId)]);

export const requests = pgTable("requests", {
  id: uuid("id").primaryKey(), idempotencyKey: text("idempotency_key").notNull(), userId: uuid("user_id").notNull().references(() => users.id), sessionId: uuid("session_id").references(() => sessions.id), profileId: uuid("profile_id").notNull().references(() => profiles.id), deviceId: text("device_id"), backendId: text("backend_id").notNull(), model: text("model").notNull(), status: outcome("status").notNull(), startedAt: timestamp("started_at", { withTimezone: true }).notNull(), finishedAt: timestamp("finished_at", { withTimezone: true }), durationMs: bigint("duration_ms", { mode: "number" }), inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0), outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0), cachedInputTokens: bigint("cached_input_tokens", { mode: "number" }).notNull().default(0), reasoningTokens: bigint("reasoning_tokens", { mode: "number" }).notNull().default(0), calls: integer("calls").notNull().default(1), compactions: integer("compactions").notNull().default(0), tools: jsonb("tools").notNull().default([]), tasks: jsonb("tasks").notNull().default([]), errorCode: text("error_code"), estimatedCostMicros: bigint("estimated_cost_micros", { mode: "number" }).notNull().default(0), weightedUnits: bigint("weighted_units", { mode: "number" }).notNull().default(0), measurementSource: text("measurement_source").notNull(), confidence: text("confidence").notNull(), metadata: jsonb("metadata").notNull().default({}),
}, table => [uniqueIndex("requests_idempotency_uq").on(table.idempotencyKey), index("requests_user_started_idx").on(table.userId, table.startedAt), index("requests_model_started_idx").on(table.model, table.startedAt)]);

export const quotaReservations = pgTable("quota_reservations", {
  id: uuid("id").primaryKey().defaultRandom(), requestId: uuid("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }), budgetLimitId: uuid("budget_limit_id").notNull().references(() => budgetLimits.id), reserved: bigint("reserved", { mode: "number" }).notNull(), actual: bigint("actual", { mode: "number" }), status: text("status").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("reservations_limit_status_idx").on(table.budgetLimitId, table.status)]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(), actorUserId: uuid("actor_user_id"), event: text("event").notNull(), targetType: text("target_type").notNull(), targetId: text("target_id"), requestId: uuid("request_id"), ipHash: text("ip_hash"), metadata: jsonb("metadata").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("audit_created_idx").on(table.createdAt), index("audit_actor_idx").on(table.actorUserId)]);
