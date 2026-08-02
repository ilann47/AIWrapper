import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { AIWrapperClient, type AIWrapperPrincipal } from "./client";

const DEFAULT_BASE_URL = import.meta.env.VITE_AIWRAPPER_API_BASE || "http://127.0.0.1:8766";

interface AIWrapperAuthValue {
  client: AIWrapperClient | null;
  principal: AIWrapperPrincipal | null;
  baseUrl: string;
  connect: (token: string) => Promise<void>;
  disconnect: () => void;
}

const AIWrapperAuthContext = createContext<AIWrapperAuthValue | null>(null);

export function AIWrapperProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ client: AIWrapperClient; principal: AIWrapperPrincipal } | null>(null);

  const value = useMemo<AIWrapperAuthValue>(() => ({
    client: session?.client ?? null,
    principal: session?.principal ?? null,
    baseUrl: DEFAULT_BASE_URL,
    connect: async token => {
      const client = new AIWrapperClient(DEFAULT_BASE_URL, token.trim());
      const principal = await client.get<AIWrapperPrincipal>("/v1/me");
      setSession({ client, principal });
    },
    disconnect: () => setSession(null),
  }), [session]);

  return <AIWrapperAuthContext.Provider value={value}>{children}</AIWrapperAuthContext.Provider>;
}

export function useAIWrapper() {
  const value = useContext(AIWrapperAuthContext);
  if (!value) throw new Error("useAIWrapper must be used inside AIWrapperProvider");
  return value;
}
