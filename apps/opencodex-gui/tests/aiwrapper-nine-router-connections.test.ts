import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildCodexManualConfigs,
  buildOpenAIEnvironment,
  normalizeAIWrapperBaseUrl,
} from "../../../extensions/aiwrapper-connections/src/nine-router-codex-config";

test("9router Codex config normalizes the endpoint and keeps Responses wire format", () => {
  expect(normalizeAIWrapperBaseUrl("https://gateway.example.com/")).toBe("https://gateway.example.com/v1");
  expect(normalizeAIWrapperBaseUrl("https://gateway.example.com/v1")).toBe("https://gateway.example.com/v1");

  const [config, auth] = buildCodexManualConfigs({
    baseUrl: "https://gateway.example.com/",
    apiKey: "aiw_user_secret",
    model: "gpt-5.6-sol",
    subagentModel: "gpt-5.6-terra",
  });
  expect(config.filename).toBe("~/.codex/config.toml");
  expect(config.content).toContain('model_provider = "aiwrapper"');
  expect(config.content).toContain('base_url = "https://gateway.example.com/v1"');
  expect(config.content).toContain('wire_api = "responses"');
  expect(config.content).toContain('model = "gpt-5.6-terra"');
  expect(auth.filename).toBe("~/.codex/auth.json");
  expect(JSON.parse(auth.content)).toEqual({ auth_mode: "apikey", OPENAI_API_KEY: "aiw_user_secret" });
});

test("OpenAI-compatible environment uses the same individual-key boundary", () => {
  expect(buildOpenAIEnvironment({
    baseUrl: "http://127.0.0.1:8766",
    apiKey: "aiw_local",
  })).toBe('OPENAI_BASE_URL="http://127.0.0.1:8766/v1"\nOPENAI_API_KEY="aiw_local"');
});

test("connection wizard is a user route and keeps secrets in component memory", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const routing = readFileSync(new URL("../src/app-routing.ts", import.meta.url), "utf8");
  const page = readFileSync(
    new URL("../../../extensions/aiwrapper-connections/src/ConnectionsPage.tsx", import.meta.url),
    "utf8",
  );

  expect(app).toContain('id: "aiwrapper-connections"');
  expect(app).toContain('<ConnectionsPage />');
  expect(routing).toContain('"aiwrapper-connections"');
  expect(page).toContain('useState("")');
  expect(page).not.toContain("localStorage");
  expect(page).not.toContain("sessionStorage");
  expect(page).toContain("useCopyFeedback");
});
