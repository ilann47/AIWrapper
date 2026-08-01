/** Adapted from codex-multi-auth lib/local-client-tokens.ts.
 * Copyright (c) 2026 ndycode, MIT. Source commit 89ca969.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export interface ApiKeyRecord { id: string; userId: string; prefix: string; digest: string; status: "active" | "revoked"; createdAt: Date; expiresAt?: Date }
export interface CreatedApiKey { secret: string; record: ApiKeyRecord }

export function createApiKey(userId: string, pepper: string, expiresAt?: Date): CreatedApiKey {
  if (pepper.length < 32) throw new Error("API key pepper must contain at least 32 characters");
  const secret = `aiw_${randomBytes(32).toString("base64url")}`;
  return { secret, record: { id: randomUUID(), userId, prefix: secret.slice(0, 12), digest: digestApiKey(secret, pepper), status: "active", createdAt: new Date(), expiresAt } };
}

export function digestApiKey(secret: string, pepper: string): string { return createHmac("sha256", pepper).update(secret).digest("hex"); }

export function verifyApiKey(secret: string, record: ApiKeyRecord, pepper: string, now = new Date()): boolean {
  if (record.status !== "active" || (record.expiresAt && record.expiresAt <= now)) return false;
  const actual = Buffer.from(digestApiKey(secret, pepper), "hex"); const expected = Buffer.from(record.digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
