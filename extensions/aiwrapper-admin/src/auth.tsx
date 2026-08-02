import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AIWrapperClient, type AIWrapperBrowserSession, type AIWrapperPrincipal } from "./client";

const DEFAULT_BASE_URL = import.meta.env.VITE_AIWRAPPER_API_BASE || "http://127.0.0.1:8766";

interface AIWrapperAuthValue {
  client: AIWrapperClient | null;
  principal: AIWrapperPrincipal | null;
  restoring: boolean;
  baseUrl: string;
  connect: (token: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

const AIWrapperAuthContext = createContext<AIWrapperAuthValue | null>(null);

export function AIWrapperProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AIWrapperBrowserSession | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let active = true;
    void AIWrapperClient.refreshSession(DEFAULT_BASE_URL)
      .then(restored => { if (active && restored) setSession(restored); })
      .catch(() => undefined)
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    const delay = Math.max(1_000, session.expiresAt - Date.now() - 30_000);
    const timer = window.setTimeout(() => {
      void AIWrapperClient.refreshSession(DEFAULT_BASE_URL)
        .then(restored => setSession(restored))
        .catch(() => setSession(null));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [session]);

  const connect = useCallback(async (token: string) => {
    setSession(await AIWrapperClient.createSession(DEFAULT_BASE_URL, token.trim()));
  }, []);

  const disconnect = useCallback(async () => {
    const current = session;
    setSession(null);
    if (current) await current.client.deleteSession().catch(() => undefined);
  }, [session]);

  const value = useMemo<AIWrapperAuthValue>(() => ({
    client: session?.client ?? null,
    principal: session?.principal ?? null,
    restoring,
    baseUrl: DEFAULT_BASE_URL,
    connect,
    disconnect,
  }), [connect, disconnect, restoring, session]);

  return <AIWrapperAuthContext.Provider value={value}>{children}</AIWrapperAuthContext.Provider>;
}

export function useAIWrapper() {
  const value = useContext(AIWrapperAuthContext);
  if (!value) throw new Error("useAIWrapper must be used inside AIWrapperProvider");
  return value;
}
