import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("production Compose keeps both imported runtimes private behind one ingress", () => {
  const compose = read("docker-compose.production.yml");
  expect(compose).toContain("VITE_AIWRAPPER_API_BASE: /aiwrapper");
  expect(compose).toContain("AIWRAPPER_PUBLIC_ORIGIN:?");
  expect(compose).toContain("OPENCODEX_API_AUTH_TOKEN:?");
  expect(compose).toContain("OPENCODEX_ADMIN_AUTH_TOKEN:?");
  expect(compose).toContain("AIWRAPPER_OWNER_KEY:?");
  expect(compose).toContain("condition: service_healthy");
  expect(compose).not.toMatch(/^\s+ports:\s*\n\s+-.*876[56]/m);
  expect(compose).toContain("${AIWRAPPER_PUBLIC_BIND:-127.0.0.1}:${AIWRAPPER_PUBLIC_PORT:-8080}:8080");
});

test("9router-style ingress preserves SSE and strips only the AIWrapper prefix", () => {
  const nginx = read("infra/gateway/nginx.conf");
  expect(nginx).toContain("location ^~ /aiwrapper/");
  expect(nginx).toContain("proxy_pass http://aiwrapper_gateway/;");
  expect(nginx).toContain("proxy_buffering off;");
  expect(nginx).toContain("proxy_request_buffering off;");
  expect(nginx).toContain("proxy_read_timeout 3600s;");
  expect(nginx).toContain("proxy_set_header X-Forwarded-Proto $forwarded_proto;");
  expect(nginx).toContain('add_header X-Content-Type-Options "nosniff" always;');
});

test("production topology smoke verifies identity, readiness and admission", () => {
  const smoke = read("scripts/e2e/production-compose-smoke.mjs");
  expect(smoke).toContain('health?.service !== "opencodex"');
  expect(smoke).toContain('live?.service !== "aiwrapper-codex-wrapper"');
  expect(smoke).toContain('body?.dependencies?.database === "ok"');
  expect(smoke).toContain("Anonymous model discovery was not rejected");
  expect(smoke).toContain("Anonymous OpenCodex management was not rejected");
  expect(smoke).toContain('"X-OpenCodex-API-Key": ADMIN_TOKEN');
});
