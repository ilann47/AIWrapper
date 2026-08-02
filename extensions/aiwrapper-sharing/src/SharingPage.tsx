import { useEffect, useState } from "react";
import { IconCheck, IconLink, IconPlus, IconTrash } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { EmptyState, Notice } from "../../../apps/opencodex-gui/src/ui";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";
import type { SessionRecord } from "../../aiwrapper-admin/src/client";

interface ShareRecord { id: string; sessionId: string; url: string | null; expiresAt?: string; createdAt: string }

export default function SharingPage() {
  const { client } = useAIWrapper();
  const t = useT();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("168");
  const [createdUrl, setCreatedUrl] = useState("");
  const [error, setError] = useState("");
  const load = async () => {
    if (!client) return;
    try {
      const [sessionResult, shareResult] = await Promise.all([client.get<{ data: SessionRecord[] }>("/v1/sessions"), client.get<{ data: ShareRecord[] }>("/v1/shares")]);
      setSessions(sessionResult.data); setShares(shareResult.data); setSessionId(current => current || sessionResult.data[0]?.id || ""); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  useEffect(() => { void load(); }, [client]);
  return (
    <PageFrame title="aiw.sharing.title" subtitle="aiw.sharing.subtitle">
      <div className="aiw-stack">
        <section className="panel"><div className="panel-head"><h3 className="panel-title">{t("aiw.sharing.create")}</h3></div><div className="aiw-toolbar"><select className="input" aria-label={t("aiw.sharing.session")} value={sessionId} onChange={event => setSessionId(event.target.value)}>{sessions.map(session => <option key={session.id} value={session.id}>{session.title || t("aiw.chat.untitled")}</option>)}</select><select className="input" aria-label={t("aiw.sharing.expiration")} value={expiresInHours} onChange={event => setExpiresInHours(event.target.value)}><option value="24">{t("aiw.sharing.oneDay")}</option><option value="168">{t("aiw.sharing.sevenDays")}</option><option value="720">{t("aiw.sharing.thirtyDays")}</option><option value="">{t("aiw.sharing.noExpiration")}</option></select><button type="button" className="btn btn-primary" disabled={!sessionId} onClick={async () => { if (!client) return; try { const created = await client.send<ShareRecord>("/v1/shares", "POST", { sessionId, expiresInHours: expiresInHours ? Number(expiresInHours) : undefined }); if (!created.url) throw new Error(t("aiw.sharing.linkUnavailable")); setCreatedUrl(created.url); await navigator.clipboard.writeText(created.url); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } }}><IconPlus /> {t("aiw.sharing.createAction")}</button></div>{createdUrl ? <div className="aiw-share-created"><IconCheck /><div><strong>{t("aiw.sharing.createdReady")}</strong><code>{createdUrl}</code></div><button className="btn btn-sm" type="button" onClick={() => void navigator.clipboard.writeText(createdUrl)}>{t("aiw.chat.copy")}</button></div> : null}</section>
        {error && <Notice tone="err">{error}</Notice>}
        {shares.length === 0 ? <EmptyState icon={<IconLink />} title={t("aiw.sharing.empty")} /> : <section className="panel aiw-table-wrap"><table className="tbl"><thead><tr><th>{t("aiw.sharing.link")}</th><th>{t("aiw.sharing.created")}</th><th>{t("aiw.sharing.expiration")}</th><th><span className="sr-only">{t("aiw.sharing.actions")}</span></th></tr></thead><tbody>{shares.map(share => <tr key={share.id}><td>{share.url ? <a href={share.url} target="_blank" rel="noreferrer"><code>{share.url}</code></a> : <span className="muted">{t("aiw.sharing.hiddenLink")}</span>}</td><td>{new Date(share.createdAt).toLocaleString()}</td><td>{share.expiresAt ? new Date(share.expiresAt).toLocaleString() : t("aiw.sharing.noExpiration")}</td><td><button type="button" className="btn btn-danger btn-sm" aria-label={t("aiw.sharing.revoke")} onClick={async () => { if (!client || !confirm(t("aiw.sharing.revokeConfirm"))) return; await client.send(`/v1/shares/${share.id}`, "DELETE"); await load(); }}><IconTrash /></button></td></tr>)}</tbody></table></section>}
      </div>
    </PageFrame>
  );
}
