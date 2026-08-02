import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  IconArrowDown, IconArrowUp, IconCheck, IconExternal, IconLink, IconPlus,
  IconRefresh, IconSearch, IconStar, IconTrash, IconX,
} from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { EmptyState, Notice, Select } from "../../../apps/opencodex-gui/src/ui";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";
import type { ModelRecord, SessionRecord } from "../../aiwrapper-admin/src/client";
import {
  buildUserContent, createChatId, fileToDataUrl, formatRelativeTime,
  type ChatAttachment,
} from "./nine-router-chat-core";
import {
  ChatFindHighlighter, contextUsageTone, formatContextWindowTokens,
} from "./traycer-chat-runtime";
import {
  projectSessionHistory,
  type SessionHistorySort,
} from "./traycer-session-history";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments?: ChatAttachment[];
  elapsed?: number;
  status?: "streaming" | "done" | "error";
}

interface UsageWindow { used: number; limit: number }
interface UsageSummary { windows: { "5h": UsageWindow; "7d": UsageWindow }; used_percent: number }

function parseStoredUserContent(value: string): Pick<Message, "text" | "attachments"> {
  try {
    const parts = JSON.parse(value) as { type?: string; text?: string; image_url?: { url?: string } }[];
    if (!Array.isArray(parts)) return { text: value };
    return {
      text: parts.filter(part => part.type === "text").map(part => part.text ?? "").join("\n"),
      attachments: parts.filter(part => part.type === "image_url" && part.image_url?.url).map((part, index) => ({
        id: `stored-${index}`,
        name: `image-${index + 1}`,
        type: "image/*",
        size: 0,
        dataUrl: part.image_url?.url ?? "",
      })),
    };
  } catch { return { text: value }; }
}

function messagesFromThread(value: unknown): Message[] {
  if (!value || typeof value !== "object") return [];
  const turns = (value as { thread?: { turns?: unknown[] } }).thread?.turns ?? [];
  const messages: Message[] = [];
  for (const turn of turns) {
    if (!turn || typeof turn !== "object") continue;
    for (const item of (turn as { items?: unknown[] }).items ?? []) {
      if (!item || typeof item !== "object") continue;
      const row = item as { id?: string | number; type?: string; text?: string; content?: { text?: string }[] };
      if (row.type === "userMessage") {
        const stored = row.content?.map(part => part.text ?? "").join("\n") ?? "";
        messages.push({ id: String(row.id ?? createChatId()), role: "user", ...parseStoredUserContent(stored), status: "done" });
      }
      if (row.type === "agentMessage") messages.push({ id: String(row.id ?? createChatId()), role: "assistant", text: row.text ?? "", status: "done" });
    }
  }
  return messages;
}

function countMatches(messages: readonly Message[], query: string): number {
  if (!query) return 0;
  const needle = query.toLocaleLowerCase();
  let total = 0;
  for (const message of messages) {
    const haystack = message.text.toLocaleLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1) { total += 1; index = haystack.indexOf(needle, index + Math.max(needle.length, 1)); }
  }
  return total;
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
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sessionSort, setSessionSort] = useState<SessionHistorySort>("recent");
  const [chatSearch, setChatSearch] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [usage, setUsage] = useState<UsageSummary>();
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const highlighterRef = useRef<ChatFindHighlighter | null>(null);

  const refreshSessions = useCallback(async () => {
    if (!client) return [];
    const result = await client.get<{ data: SessionRecord[] }>("/v1/sessions");
    setSessions(result.data);
    return result.data;
  }, [client]);

  useEffect(() => {
    if (!client) return;
    void Promise.all([
      refreshSessions(),
      client.get<{ data: ModelRecord[] }>("/v1/models").then(result => {
        setModels(result.data);
        if (result.data[0]?.id) setModel(result.data[0].id);
      }),
      client.get<UsageSummary>("/v1/me/usage").then(setUsage),
    ]).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [client, refreshSessions]);

  useEffect(() => {
    const highlighter = new ChatFindHighlighter("aiwrapper-chat");
    highlighterRef.current = highlighter;
    return () => { highlighter.dispose(); highlighterRef.current = null; };
  }, []);

  const matchCount = useMemo(() => countMatches(messages, chatSearch.trim()), [chatSearch, messages]);
  useEffect(() => {
    const root = messagesRef.current;
    const highlighter = highlighterRef.current;
    const query = chatSearch.trim();
    if (!root || !highlighter || !query || matchCount === 0) { highlighter?.clear(); return; }
    highlighter.paint({ root, query, matchCase: false, activeMatchIndex: Math.min(activeMatch, matchCount - 1), scrollActiveIntoView: true });
  }, [activeMatch, chatSearch, matchCount, messages]);

  useEffect(() => {
    const root = messagesRef.current;
    if (busy) root?.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
  }, [busy, messages]);

  const efforts = useMemo(() => {
    const available = models.find(item => item.id === model)?.supportedReasoningEfforts?.map(item => item.reasoningEffort);
    return available?.length ? available : ["low", "medium", "high", "xhigh"];
  }, [model, models]);

  const visibleSessions = useMemo(() => projectSessionHistory(sessions, {
    query: sessionSearch,
    favoritesOnly,
    sort: sessionSearch.trim() && sessionSort === "recent" ? "relevance" : sessionSort,
  }), [favoritesOnly, sessionSearch, sessionSort, sessions]);

  const currentSession = sessions.find(session => session.id === sessionId);

  const openSession = async (id: string) => {
    if (!client || busy) return;
    setError("");
    try {
      const result = await client.get<{ session: SessionRecord; thread: unknown }>(`/v1/sessions/${id}`);
      setSessionId(id);
      setModel(result.session.model);
      setMessages(messagesFromThread(result));
      setAttachments([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const newSession = () => {
    abortRef.current?.abort();
    setSessionId(undefined); setMessages([]); setInput(""); setAttachments([]); setError(""); setNotice("");
  };

  const updateSession = async (id: string, body: { title?: string; favorite?: boolean }) => {
    if (!client) return;
    await client.send(`/v1/sessions/${id}`, "PATCH", body);
    await refreshSessions();
  };

  const exportSession = async (id: string) => {
    if (!client) return;
    const blob = await client.download(`/v1/sessions/${id}/export?format=markdown`);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `aiwrapper-${id}.md`; anchor.click();
    URL.revokeObjectURL(url);
  };

  const shareSession = async (id: string) => {
    if (!client) return;
    const share = await client.send<{ url: string }>("/v1/shares", "POST", { sessionId: id });
    await navigator.clipboard.writeText(share.url);
    setNotice(t("aiw.chat.shareCopied"));
  };

  const archiveSession = async (id: string) => {
    if (!client || !confirm(t("aiw.chat.deleteConfirm"))) return;
    await client.send(`/v1/sessions/${id}`, "DELETE");
    if (id === sessionId) newSession();
    await refreshSessions();
  };

  const sendPrompt = async (prompt: string, promptAttachments: readonly ChatAttachment[] = attachments) => {
    if (!client || (!prompt.trim() && promptAttachments.length === 0) || busy) return;
    const userId = createChatId();
    const assistantId = createChatId();
    const startedAt = performance.now();
    let generated = "";
    const controller = new AbortController();
    abortRef.current = controller;
    setInput(""); setAttachments([]); setBusy(true); setError(""); setNotice("");
    setMessages(current => [...current,
      { id: userId, role: "user", text: prompt, attachments: [...promptAttachments], status: "done" },
      { id: assistantId, role: "assistant", text: "", status: "streaming" },
    ]);
    try {
      const result = await client.streamChat({
        model, stream: true, reasoning_effort: effort,
        metadata: sessionId ? { session_id: sessionId } : {},
        messages: [{ role: "user", content: buildUserContent(prompt, promptAttachments) }],
      }, delta => {
        generated += delta;
        setMessages(current => current.map(message => message.id === assistantId ? { ...message, text: generated } : message));
      }, controller.signal);
      const elapsed = (performance.now() - startedAt) / 1000;
      setMessages(current => current.map(message => message.id === assistantId ? { ...message, status: "done", elapsed } : message));
      if (result.rtkSavedBytes > 0) setNotice(t("aiw.chat.rtkSaved", { bytes: String(result.rtkSavedBytes) }));
      const latest = await refreshSessions();
      if (!sessionId) setSessionId(latest[0]?.id);
      if (client) void client.get<UsageSummary>("/v1/me/usage").then(setUsage);
    } catch (reason) {
      const aborted = reason instanceof DOMException && reason.name === "AbortError";
      setMessages(current => current.map(message => message.id === assistantId ? { ...message, status: aborted ? "done" : "error" } : message));
      if (!aborted) setError(reason instanceof Error ? reason.message : String(reason));
    } finally { abortRef.current = null; setBusy(false); }
  };

  const attachFiles = async (files: FileList | null) => {
    const images = [...(files ?? [])].filter(file => file.type.startsWith("image/"));
    const converted = await Promise.all(images.map(async file => ({
      id: createChatId(), name: file.name, type: file.type, size: file.size, dataUrl: await fileToDataUrl(file),
    })));
    setAttachments(current => [...current, ...converted]);
  };

  const lastUser = [...messages].reverse().find(message => message.role === "user");
  const quota = usage?.windows["7d"];
  const quotaLeft = quota ? Math.max(0, Math.round((1 - quota.used / Math.max(1, quota.limit)) * 100)) : undefined;

  return (
    <PageFrame title="aiw.chat.title" subtitle="aiw.chat.subtitle">
      <div className="aiw-chat-layout aiw-chat-workspace">
        <aside className="aiw-conversation-rail panel">
          <button type="button" className="btn btn-primary" onClick={newSession}><IconPlus /> {t("aiw.chat.new")}</button>
          <label className="aiw-session-search"><IconSearch /><input value={sessionSearch} onChange={event => setSessionSearch(event.target.value)} placeholder={t("aiw.chat.searchSessions")} /></label>
          <div className="aiw-session-controls">
            <button type="button" className={`btn btn-sm ${favoritesOnly ? "btn-primary" : "btn-ghost"}`} onClick={() => setFavoritesOnly(value => !value)}><IconStar /> {t("aiw.chat.favorites")}</button>
            <Select
              value={sessionSort}
              options={[
                { value: "recent", label: t("aiw.chat.sortRecent") },
                { value: "oldest", label: t("aiw.chat.sortOldest") },
                { value: "title-asc", label: t("aiw.chat.sortTitleAsc") },
                { value: "title-desc", label: t("aiw.chat.sortTitleDesc") },
              ]}
              onChange={value => setSessionSort(value as SessionHistorySort)}
              label={t("aiw.chat.sort")}
            />
          </div>
          <div className="section-sep"><span className="section-label">{t("aiw.chat.history")}</span></div>
          <div className="aiw-session-list">
            {visibleSessions.map(session => (
              <div className={`aiw-session-row${session.id === sessionId ? " active" : ""}`} key={session.id}>
                <button type="button" className="aiw-session" onClick={() => void openSession(session.id)}>
                  <strong>{session.title || t("aiw.chat.untitled")}</strong>
                  <small>{session.model} · {formatRelativeTime(session.updatedAt)}</small>
                </button>
                <button type="button" className="aiw-session-star" aria-label={t("aiw.chat.favorite")} onClick={() => void updateSession(session.id, { favorite: !session.favorite })}><IconStar className={session.favorite ? "is-favorite" : ""} /></button>
              </div>
            ))}
          </div>
        </aside>

        <section className="aiw-conversation panel">
          <div className="aiw-chat-topbar">
            <div className="aiw-toolbar">
              <Select value={model} options={models.map(item => ({ value: item.id, label: item.displayName ?? item.id }))} onChange={setModel} label={t("aiw.chat.model")} />
              <Select value={effort} options={efforts.map(value => ({ value, label: value }))} onChange={setEffort} label={t("aiw.chat.effort")} />
              {quota && quotaLeft !== undefined && <span className={`badge ${contextUsageTone(quotaLeft)}`} title={`${formatContextWindowTokens(quota.used)} / ${formatContextWindowTokens(quota.limit)}`}>{t("aiw.chat.quotaLeft", { percent: String(quotaLeft) })}</span>}
            </div>
            {currentSession && <div className="aiw-chat-actions" data-find-skip>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const title = prompt(t("aiw.chat.renamePrompt"), currentSession.title); if (title) void updateSession(currentSession.id, { title }); }}>{t("aiw.chat.rename")}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void shareSession(currentSession.id)}><IconLink /> {t("aiw.chat.share")}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void exportSession(currentSession.id)}><IconExternal /> {t("aiw.chat.export")}</button>
              <button type="button" className="btn btn-danger btn-sm" aria-label={t("aiw.chat.delete")} onClick={() => void archiveSession(currentSession.id)}><IconTrash /></button>
            </div>}
          </div>

          {messages.length > 0 && <div className="aiw-findbar" data-find-skip>
            <IconSearch /><input value={chatSearch} onChange={event => { setChatSearch(event.target.value); setActiveMatch(0); }} placeholder={t("aiw.chat.searchMessages")} />
            <span>{matchCount ? `${Math.min(activeMatch + 1, matchCount)}/${matchCount}` : "0/0"}</span>
            <button type="button" disabled={!matchCount} onClick={() => setActiveMatch(value => (value - 1 + matchCount) % matchCount)} aria-label={t("aiw.chat.previousMatch")}><IconArrowUp /></button>
            <button type="button" disabled={!matchCount} onClick={() => setActiveMatch(value => (value + 1) % matchCount)} aria-label={t("aiw.chat.nextMatch")}><IconArrowDown /></button>
            <button type="button" onClick={() => setChatSearch("")} aria-label={t("common.close")}><IconX /></button>
          </div>}

          <div className="aiw-messages" ref={messagesRef} aria-live="polite">
            {messages.length === 0 && <EmptyState title={t("aiw.chat.empty")}><span>{t("aiw.chat.emptyHint")}</span></EmptyState>}
            {messages.map(message => (
              <article className={`aiw-message aiw-message--${message.role}`} key={message.id} data-chat-find-unit={message.id}>
                <header><span>{message.role === "user" ? t("aiw.chat.you") : t("aiw.chat.codex")}</span>
                  <button type="button" data-find-skip className="aiw-copy" aria-label={t("aiw.chat.copy")} onClick={async event => { await navigator.clipboard.writeText(message.text); event.currentTarget.classList.add("copied"); }}><IconCheck /></button>
                </header>
                {message.attachments?.length ? <div className="aiw-attachments">{message.attachments.map(attachment => <a href={attachment.dataUrl} target="_blank" rel="noreferrer" key={attachment.id}><img src={attachment.dataUrl} alt={attachment.name} /></a>)}</div> : null}
                <div className="aiw-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text || (message.status === "streaming" ? t("aiw.chat.responding") : "")}</ReactMarkdown></div>
                {message.elapsed !== undefined && <small>{t("aiw.chat.elapsed", { seconds: message.elapsed.toFixed(1) })}</small>}
              </article>
            ))}
          </div>

          {notice && <Notice tone="ok">{notice}</Notice>}
          {error && <Notice tone="err">{error}</Notice>}
          {attachments.length > 0 && <div className="aiw-attachment-strip">{attachments.map(attachment => <span key={attachment.id}>{attachment.name}<button type="button" onClick={() => setAttachments(current => current.filter(item => item.id !== attachment.id))}><IconX /></button></span>)}</div>}
          <div className="aiw-composer">
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => fileInputRef.current?.click()} aria-label={t("aiw.chat.attach")}><IconPlus /></button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={event => { void attachFiles(event.target.files); event.target.value = ""; }} />
            <textarea className="input" value={input} aria-label={t("aiw.chat.message")} placeholder={t("aiw.chat.placeholder")} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendPrompt(input); } }} />
            {busy ? <button type="button" className="btn btn-danger btn-icon" onClick={() => abortRef.current?.abort()} aria-label={t("aiw.chat.stop")}><IconX /></button> : <button type="button" className="btn btn-primary btn-icon" disabled={!input.trim() && attachments.length === 0} onClick={() => void sendPrompt(input)} aria-label={t("aiw.chat.send")}><IconArrowUp /></button>}
          </div>
          {lastUser && <div className="aiw-chat-followups" data-find-skip>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void sendPrompt(lastUser.text, lastUser.attachments)}><IconRefresh /> {t("aiw.chat.regenerate")}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setInput(lastUser.text)}>{t("aiw.chat.edit")}</button>
          </div>}
        </section>
      </div>
    </PageFrame>
  );
}
