#!/usr/bin/env node
/**
 * Opt-in live topology gate adapted from 9router's RUN_E2E proxy probes and
 * OpenCodex's isolated runtime smoke. It exercises the already-running
 * AIWrapper gateway without ever printing the individual key or session token.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RUN = process.env.AIWRAPPER_E2E_LIVE === "1";
const BASE = (process.env.AIWRAPPER_E2E_BASE ?? "http://127.0.0.1:8766").replace(/\/$/, "");
const ORIGIN = (process.env.AIWRAPPER_E2E_ORIGIN ?? "http://127.0.0.1:8765").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.AIWRAPPER_E2E_TIMEOUT_MS ?? 120_000);
const MARKER = `AIWRAPPER_E2E_${Date.now()}`;

function fail(message) {
  throw new Error(message);
}

function readIndividualKey() {
  const inline = process.env.AIWRAPPER_E2E_KEY?.trim();
  if (inline) return inline;
  const configured = process.env.AIWRAPPER_E2E_KEY_FILE?.trim();
  const path = resolve(configured || "services/codex-wrapper/.aiwrapper/bootstrap-owner.key");
  if (!existsSync(path)) fail(`AIWrapper E2E key file not found: ${path}`);
  const value = readFileSync(path, "utf8").trim();
  if (!value) fail(`AIWrapper E2E key file is empty: ${path}`);
  return value;
}

function redact(message, secrets) {
  return secrets.reduce(
    (safe, secret) => secret ? safe.replaceAll(secret, "<redacted>") : safe,
    String(message),
  ).replace(/Bearer\s+\S+/gi, "Bearer <redacted>");
}

async function request(path, init = {}, expected = [200]) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!expected.includes(response.status)) {
    const detail = (await response.text()).slice(0, 500);
    fail(`${init.method ?? "GET"} ${path} returned ${response.status}: ${detail}`);
  }
  return response;
}

async function json(path, init = {}, expected = [200]) {
  const response = await request(path, init, expected);
  return { response, body: await response.json() };
}

function bearer(token) {
  return { authorization: `Bearer ${token}`, origin: ORIGIN };
}

function streamText(raw) {
  let output = "";
  let done = false;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") {
      done = true;
      continue;
    }
    if (!payload) continue;
    const event = JSON.parse(payload);
    output += event.choices?.[0]?.delta?.content ?? "";
  }
  if (!done) fail("Streaming response ended without [DONE]");
  return output;
}

if (!RUN) {
  process.stderr.write(
    "Refusing to call a live provider. Set AIWRAPPER_E2E_LIVE=1 and provide " +
    "AIWRAPPER_E2E_KEY or AIWRAPPER_E2E_KEY_FILE.\n",
  );
  process.exit(2);
}

const individualKey = readIndividualKey();
let accessToken = "";
let refreshCookie = "";
let sessionId = "";
let shareId = "";
let beforeSessionIds = new Set();
const secrets = [individualKey];

try {
  const login = await json("/auth/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${individualKey}`, origin: ORIGIN },
  }, [201]);
  accessToken = login.body.accessToken;
  if (!accessToken || login.body.principal?.role !== "owner") {
    fail("Browser session did not return an owner principal");
  }
  secrets.push(accessToken);
  refreshCookie = (login.response.headers.get("set-cookie") ?? "").split(";", 1)[0];
  if (!refreshCookie.startsWith("aiwrapper_refresh=")) fail("Refresh cookie was not issued");
  secrets.push(refreshCookie.slice(refreshCookie.indexOf("=") + 1));

  const authHeaders = bearer(accessToken);
  const { body: me } = await json("/v1/me", { headers: authHeaders });
  if (me.role !== "owner") fail("Authenticated /v1/me principal is not the owner");

  const { body: models } = await json("/v1/models", { headers: authHeaders });
  const modelIds = (models.data ?? []).map(item => item.id).filter(Boolean);
  const model = process.env.AIWRAPPER_E2E_MODEL?.trim()
    || (modelIds.includes("gpt-5.6-sol") ? "gpt-5.6-sol" : modelIds[0]);
  if (!model) fail("No model is available through the gateway");

  const { body: beforeSessions } = await json("/v1/sessions", { headers: authHeaders });
  beforeSessionIds = new Set((beforeSessions.data ?? []).map(item => item.id));
  const { body: beforeUsage } = await json("/v1/me/usage", { headers: authHeaders });

  const chat = await request("/v1/chat/completions", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: 32,
      reasoning_effort: "low",
      messages: [{ role: "user", content: `Reply exactly ${MARKER}` }],
    }),
  });
  const answer = streamText(await chat.text());
  if (!answer.includes(MARKER)) fail("Live provider response did not contain the requested marker");

  const { body: afterSessions } = await json("/v1/sessions", { headers: authHeaders });
  const created = (afterSessions.data ?? []).find(item => !beforeSessionIds.has(item.id));
  if (!created) fail("Live request did not create a persisted conversation");
  sessionId = created.id;

  const { body: detail } = await json(`/v1/sessions/${encodeURIComponent(sessionId)}`, { headers: authHeaders });
  const turns = detail.thread?.turns ?? [];
  if (turns.length < 2 || JSON.stringify(turns).includes(MARKER) === false) {
    fail("Persisted conversation does not contain the complete live exchange");
  }

  const title = `Production smoke ${MARKER}`;
  const { body: updated } = await json(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ title, favorite: true }),
  });
  if (updated.title !== title || updated.favorite !== true) fail("Conversation update was not persisted");

  const exported = await request(`/v1/sessions/${encodeURIComponent(sessionId)}/export`, { headers: authHeaders });
  if (!(await exported.text()).includes(MARKER)) fail("Markdown export omitted the live exchange");

  const { body: shared } = await json("/v1/shares", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ sessionId, expiresInHours: 1 }),
  }, [201]);
  shareId = shared.id;
  const shareToken = String(shared.url ?? "").split("/#shared/")[1];
  if (!shareId || !shareToken) fail("Conversation share did not return a one-time URL");
  secrets.push(shareToken);
  const { body: publicShare } = await json(`/public/shares/${encodeURIComponent(shareToken)}`);
  if (JSON.stringify(publicShare).includes(MARKER) === false) fail("Public share omitted the live exchange");

  const { body: afterUsage } = await json("/v1/me/usage", { headers: authHeaders });
  if ((afterUsage.request_count ?? 0) < (beforeUsage.request_count ?? 0) + 1) {
    fail("Usage ledger did not record the live request");
  }

  process.stdout.write(`${JSON.stringify({
    verdict: "PASS",
    topology: { web: ORIGIN, gateway: BASE },
    principal: { role: me.role, profileId: me.profileId },
    model,
    checks: [
      "origin-bound browser session",
      "model discovery",
      "streaming provider response",
      "conversation persistence",
      "rename and favorite",
      "Markdown export",
      "expiring public share",
      "usage ledger",
    ],
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${redact(error instanceof Error ? error.message : error, secrets)}\n`);
  process.exitCode = 1;
} finally {
  const authHeaders = accessToken ? bearer(accessToken) : {};
  if (accessToken && !sessionId) {
    const createdAfterFailure = await json("/v1/sessions", { headers: authHeaders })
      .then(({ body }) => (body.data ?? []).find(item => !beforeSessionIds.has(item.id) && String(item.title).includes(MARKER)))
      .catch(() => null);
    sessionId = createdAfterFailure?.id ?? "";
  }
  if (shareId) {
    await request(`/v1/shares/${encodeURIComponent(shareId)}`, {
      method: "DELETE",
      headers: authHeaders,
    }, [204]).catch(() => undefined);
  }
  if (sessionId) {
    await request(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: authHeaders,
    }, [204]).catch(() => undefined);
  }
  if (accessToken) {
    await request("/auth/sessions/current", {
      method: "DELETE",
      headers: { ...authHeaders, cookie: refreshCookie },
    }, [204]).catch(() => undefined);
  }
}
