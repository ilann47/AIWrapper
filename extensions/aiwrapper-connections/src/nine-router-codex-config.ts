export interface ManualConfig {
  filename: string;
  content: string;
  containsSecret?: boolean;
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

export function normalizeAIWrapperBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

/** Adapted from 9router's CodexToolCard.getManualConfigs. */
export function buildCodexManualConfigs(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  subagentModel?: string;
}): ManualConfig[] {
  const endpoint = normalizeAIWrapperBaseUrl(input.baseUrl);
  const apiKey = input.apiKey.trim() || "<YOUR_INDIVIDUAL_AIWRAPPER_KEY>";
  const model = input.model.trim() || "<MODEL_ID>";
  const subagentModel = input.subagentModel?.trim() || model;

  const configContent = `# AIWrapper configuration for Codex CLI
model = ${quoted(model)}
model_provider = "aiwrapper"

[model_providers.aiwrapper]
name = "AIWrapper"
base_url = ${quoted(endpoint)}
wire_api = "responses"

[agents.subagent]
model = ${quoted(subagentModel)}
`;

  const authContent = JSON.stringify({
    auth_mode: "apikey",
    OPENAI_API_KEY: apiKey,
  }, null, 2);

  return [
    { filename: "~/.codex/config.toml", content: configContent },
    { filename: "~/.codex/auth.json", content: authContent, containsSecret: true },
  ];
}

export function buildOpenAIEnvironment(input: { baseUrl: string; apiKey: string }): string {
  const endpoint = normalizeAIWrapperBaseUrl(input.baseUrl);
  const key = input.apiKey.trim() || "<YOUR_INDIVIDUAL_AIWRAPPER_KEY>";
  return `OPENAI_BASE_URL=${quoted(endpoint)}\nOPENAI_API_KEY=${quoted(key)}`;
}
