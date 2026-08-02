export type AIWrapperRole = "user" | "operator" | "admin" | "owner";

export interface AIWrapperPrincipal {
  userId: string;
  profileId: string;
  role: AIWrapperRole;
}

export interface AIWrapperSessionResponse {
  accessToken: string;
  expiresIn: number;
  principal: AIWrapperPrincipal;
}

export interface AIWrapperBrowserSession {
  client: AIWrapperClient;
  principal: AIWrapperPrincipal;
  expiresAt: number;
}

export interface ModelRecord {
  id: string;
  displayName?: string;
  description?: string;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: { reasoningEffort: string }[];
}

export interface SessionRecord {
  id: string;
  title: string;
  model: string;
  threadId?: string;
  status: string;
  favorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export class AIWrapperClient {
  readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  static async createSession(baseUrl: string, apiKey: string): Promise<AIWrapperBrowserSession> {
    const response = await fetch(`${baseUrl}/auth/sessions`, {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(await response.text());
    const session = await response.json() as AIWrapperSessionResponse;
    return { client: new AIWrapperClient(baseUrl, session.accessToken), principal: session.principal, expiresAt: Date.now() + session.expiresIn * 1000 };
  }

  static async refreshSession(baseUrl: string): Promise<AIWrapperBrowserSession | null> {
    const response = await fetch(`${baseUrl}/auth/sessions/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "X-AIWrapper-Session": "refresh" },
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(await response.text());
    const session = await response.json() as AIWrapperSessionResponse;
    return { client: new AIWrapperClient(baseUrl, session.accessToken), principal: session.principal, expiresAt: Date.now() + session.expiresIn * 1000 };
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail || `${response.status} ${response.statusText}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  async deleteSession(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/auth/sessions/current`, {
      method: "DELETE",
      credentials: "include",
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok && response.status !== 401) throw new Error(await response.text());
  }

  send<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async streamChat(body: unknown, onDelta: (text: string) => void, signal?: AbortSignal): Promise<{ rtkSavedBytes: number }> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error(await response.text());
    if (!response.body) throw new Error("SSE response has no body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          const event = JSON.parse(payload) as {
            choices?: { delta?: { content?: unknown } }[];
            error?: { message?: string };
          };
          const delta = event.choices?.[0]?.delta?.content;
          if (typeof delta === "string") onDelta(delta);
          if (event.error) throw new Error(event.error.message ?? "SSE stream failed");
        }
      }
      if (done) break;
    }
    return { rtkSavedBytes: Number(response.headers.get("X-AIWrapper-RTK-Saved-Bytes") ?? 0) || 0 };
  }

  async download(path: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.blob();
  }
}
