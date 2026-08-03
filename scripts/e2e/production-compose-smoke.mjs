#!/usr/bin/env node
/** Identity-aware smoke for the same-origin production ingress. */

const ORIGIN = (process.env.AIWRAPPER_PRODUCTION_E2E_ORIGIN ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.AIWRAPPER_PRODUCTION_E2E_TIMEOUT_MS ?? 120_000);
const ADMIN_TOKEN = process.env.OPENCODEX_ADMIN_AUTH_TOKEN?.trim();

function fail(message) {
  throw new Error(message);
}

async function request(path, init = {}) {
  return fetch(`${ORIGIN}${path}`, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
}

async function waitForReady() {
  const startedAt = Date.now();
  let last = "not attempted";
  while (Date.now() - startedAt < TIMEOUT_MS) {
    try {
      const response = await request("/aiwrapper/health/ready");
      const body = await response.json().catch(() => null);
      if (
        response.ok
        && body?.status === "ok"
        && body?.dependencies?.database === "ok"
        && body?.dependencies?.opencodex?.status === "ok"
      ) return body;
      last = `${response.status} ${JSON.stringify(body)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  fail(`Production topology did not become ready: ${last}`);
}

const readiness = await waitForReady();
if (!ADMIN_TOKEN) fail("OPENCODEX_ADMIN_AUTH_TOKEN is required to verify the production management boundary");

const healthResponse = await request("/healthz");
const health = await healthResponse.json().catch(() => null);
if (!healthResponse.ok || health?.service !== "opencodex") {
  fail(`Ingress /healthz did not identify OpenCodex: ${healthResponse.status}`);
}

const liveResponse = await request("/aiwrapper/health/live");
const live = await liveResponse.json().catch(() => null);
if (!liveResponse.ok || live?.service !== "aiwrapper-codex-wrapper") {
  fail(`Ingress /aiwrapper/health/live did not identify Codex-Wrapper: ${liveResponse.status}`);
}

const shellResponse = await request("/");
const shell = await shellResponse.text();
if (!shellResponse.ok || !shell.includes('id="root"')) {
  fail(`Production ingress did not serve the OpenCodex GUI: ${shellResponse.status}`);
}
if (shellResponse.headers.get("x-content-type-options") !== "nosniff") {
  fail("Production ingress security headers are missing");
}

const anonymousModels = await request("/aiwrapper/v1/models");
if (![401, 403].includes(anonymousModels.status)) {
  fail(`Anonymous model discovery was not rejected: ${anonymousModels.status}`);
}

const anonymousManagement = await request("/api/config");
if (![401, 403].includes(anonymousManagement.status)) {
  fail(`Anonymous OpenCodex management was not rejected: ${anonymousManagement.status}`);
}
const authenticatedManagement = await request("/api/config", {
  headers: { "X-OpenCodex-API-Key": ADMIN_TOKEN },
});
const management = await authenticatedManagement.json().catch(() => null);
if (!authenticatedManagement.ok || !management?.providers || typeof management.providers !== "object") {
  fail(`Authenticated OpenCodex management failed: ${authenticatedManagement.status}`);
}

process.stdout.write(`${JSON.stringify({
  verdict: "PASS",
  origin: ORIGIN,
  checks: [
    "OpenCodex identity through ingress",
    "Codex-Wrapper liveness through /aiwrapper",
    "dependency-aware readiness",
    "compiled OpenCodex GUI",
    "security headers",
    "anonymous API rejection",
    "independent OpenCodex management admission",
  ],
  dependencies: readiness.dependencies,
}, null, 2)}\n`);
