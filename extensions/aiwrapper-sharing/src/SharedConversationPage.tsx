import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconLink } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { EmptyState, Notice } from "../../../apps/opencodex-gui/src/ui";

const API_BASE = import.meta.env.VITE_AIWRAPPER_API_BASE || "http://127.0.0.1:8766";

interface PublicMessage { id: number; role: "user" | "assistant"; content: string; created_at: string }
interface PublicShare {
  shareId: string;
  session: { title: string; model: string; createdAt: string; updatedAt: string };
  messages: PublicMessage[];
}

function messageText(content: string): string {
  try {
    const parts = JSON.parse(content) as { type?: string; text?: string }[];
    return Array.isArray(parts) ? parts.filter(part => part.type === "text").map(part => part.text ?? "").join("\n") : content;
  } catch {
    return content;
  }
}

export default function SharedConversationPage({ token }: { token: string }) {
  const t = useT();
  const [share, setShare] = useState<PublicShare>();
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${API_BASE}/public/shares/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? t("aiw.shared.unavailable") : await response.text());
        return response.json() as Promise<PublicShare>;
      })
      .then(setShare)
      .catch(reason => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [t, token]);

  return (
    <main className="aiw-public-share">
      <header className="aiw-public-share__head">
        <IconLink aria-hidden />
        <div><span className="section-label">AIWrapper</span><h1>{share?.session.title ?? t("aiw.shared.title")}</h1></div>
      </header>
      {error && <Notice tone="err">{error}</Notice>}
      {!share && !error ? <div className="panel" role="status">{t("aiw.shared.loading")}</div> : null}
      {share ? <>
        <div className="aiw-public-share__meta"><span className="badge badge-muted">{share.session.model}</span><span>{t("aiw.shared.readOnly")}</span></div>
        <section className="panel aiw-public-share__transcript">
          {share.messages.length === 0 ? <EmptyState title={t("aiw.shared.empty")} /> : share.messages.map(message => (
            <article className={`aiw-message aiw-message--${message.role}`} key={message.id}>
              <header><span>{message.role === "user" ? t("aiw.chat.you") : t("aiw.chat.codex")}</span><time>{new Date(message.created_at).toLocaleString()}</time></header>
              <div className="aiw-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{messageText(message.content)}</ReactMarkdown></div>
            </article>
          ))}
        </section>
      </> : null}
    </main>
  );
}
