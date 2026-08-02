import { useEffect, useMemo, useState } from "react";
import { IconArrowUp, IconPlus } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { EmptyState, Notice, Select } from "../../../apps/opencodex-gui/src/ui";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";
import type { ModelRecord, SessionRecord } from "../../aiwrapper-admin/src/client";

interface Message { role: "user" | "assistant"; text: string }

function messagesFromThread(value: unknown): Message[] {
  if (!value || typeof value !== "object") return [];
  const thread = (value as { thread?: { turns?: unknown[] } }).thread;
  const messages: Message[] = [];
  for (const turn of thread?.turns ?? []) {
    if (!turn || typeof turn !== "object") continue;
    for (const item of (turn as { items?: unknown[] }).items ?? []) {
      if (!item || typeof item !== "object") continue;
      const row = item as { type?: string; text?: string; content?: { text?: string }[] };
      if (row.type === "userMessage") messages.push({ role: "user", text: row.content?.map(part => part.text ?? "").join("\n") ?? "" });
      if (row.type === "agentMessage") messages.push({ role: "assistant", text: row.text ?? "" });
    }
  }
  return messages;
}

export default function ChatPage() {
  const { client } = useAIWrapper();
  const t = useT();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [model, setModel] = useState("gpt-5.6-sol");
  const [effort, setEffort] = useState("medium");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState<number>();
  const [error, setError] = useState("");

  const refreshSessions = async () => {
    if (!client) return;
    const result = await client.get<{ data: SessionRecord[] }>("/v1/sessions");
    setSessions(result.data);
  };

  useEffect(() => {
    if (!client) return;
    void Promise.all([
      refreshSessions(),
      client.get<{ data: ModelRecord[] }>("/v1/models").then(result => {
        setModels(result.data);
        if (result.data[0]?.id) setModel(result.data[0].id);
      }),
    ]).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [client]);

  const efforts = useMemo(() => {
    const selected = models.find(item => item.id === model);
    const available = selected?.supportedReasoningEfforts?.map(item => item.reasoningEffort);
    return available?.length ? available : ["low", "medium", "high", "xhigh"];
  }, [model, models]);

  const openSession = async (id: string) => {
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.get<{ session: SessionRecord; thread: unknown }>(`/v1/sessions/${id}`);
      setSessionId(id);
      setModel(result.session.model);
      setMessages(messagesFromThread(result));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  const newSession = () => {
    setSessionId(undefined);
    setMessages([]);
    setInput("");
    setElapsed(undefined);
    setError("");
  };

  const send = async () => {
    const prompt = input.trim();
    if (!client || !prompt || busy) return;
    const startedAt = performance.now();
    let generated = "";
    setInput("");
    setBusy(true);
    setElapsed(undefined);
    setError("");
    setMessages(current => [...current, { role: "user", text: prompt }, { role: "assistant", text: "" }]);
    try {
      await client.streamChat({
        model,
        stream: true,
        reasoning_effort: effort,
        metadata: sessionId ? { session_id: sessionId } : {},
        messages: [{ role: "user", content: prompt }],
      }, delta => {
        generated += delta;
        setMessages(current => [...current.slice(0, -1), { role: "assistant", text: generated }]);
      });
      setElapsed((performance.now() - startedAt) / 1000);
      await refreshSessions();
      if (!sessionId) {
        const latest = await client.get<{ data: SessionRecord[] }>("/v1/sessions");
        setSessionId(latest.data[0]?.id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  return (
    <PageFrame title="aiw.chat.title" subtitle="aiw.chat.subtitle">
      <div className="aiw-chat-layout">
        <aside className="aiw-conversation-rail panel">
          <button type="button" className="btn btn-primary" onClick={newSession}><IconPlus /> {t("aiw.chat.new")}</button>
          <div className="section-sep"><span className="section-label">{t("aiw.chat.history")}</span></div>
          <div className="aiw-session-list">
            {sessions.map(session => (
              <button type="button" className={`aiw-session${session.id === sessionId ? " active" : ""}`} key={session.id} onClick={() => void openSession(session.id)}>
                <strong>{session.title || t("aiw.chat.untitled")}</strong>
                <small>{session.model}</small>
              </button>
            ))}
          </div>
        </aside>
        <section className="aiw-conversation panel">
          <div className="aiw-toolbar">
            <Select value={model} options={models.map(item => ({ value: item.id, label: item.displayName ?? item.id }))} onChange={setModel} label={t("aiw.chat.model")} />
            <Select value={effort} options={efforts.map(value => ({ value, label: value }))} onChange={setEffort} label={t("aiw.chat.effort")} />
            {elapsed !== undefined && <span className="badge badge-green">{t("aiw.chat.elapsed", { seconds: elapsed.toFixed(1) })}</span>}
          </div>
          <div className="aiw-messages" aria-live="polite">
            {messages.length === 0 && <EmptyState title={t("aiw.chat.empty")}><span>{t("aiw.chat.emptyHint")}</span></EmptyState>}
            {messages.map((message, index) => (
              <article className={`aiw-message aiw-message--${message.role}`} key={`${message.role}-${index}`}>
                <span>{message.role === "user" ? t("aiw.chat.you") : t("aiw.chat.codex")}</span>
                <div>{message.text || <i>{t("aiw.chat.responding")}</i>}</div>
              </article>
            ))}
          </div>
          {error && <Notice tone="err">{error}</Notice>}
          <div className="aiw-composer">
            <textarea className="input" value={input} aria-label={t("aiw.chat.message")} placeholder={t("aiw.chat.placeholder")} onChange={event => setInput(event.target.value)} onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
            }} />
            <button type="button" className="btn btn-primary btn-icon" disabled={busy || !input.trim()} onClick={() => void send()} aria-label={t("aiw.chat.send")}><IconArrowUp /></button>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
