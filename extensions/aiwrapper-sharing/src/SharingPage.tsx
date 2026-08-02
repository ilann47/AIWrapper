import { useEffect, useState } from "react";
import { IconLink, IconPlus } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { EmptyState, Notice } from "../../../apps/opencodex-gui/src/ui";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";
import type { SessionRecord } from "../../aiwrapper-admin/src/client";

interface ShareRecord { id: string; sessionId: string; url: string; expiresAt?: string; createdAt: string }

export default function SharingPage() {
  const { client } = useAIWrapper();
  const t = useT();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [shares, setShares] = useState<ShareRecord[]>([]);
  const [sessionId, setSessionId] = useState("");
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
        <section className="panel"><div className="panel-head"><h3 className="panel-title">{t("aiw.sharing.create")}</h3></div><div className="aiw-toolbar"><select className="input" value={sessionId} onChange={event => setSessionId(event.target.value)}>{sessions.map(session => <option key={session.id} value={session.id}>{session.title || t("aiw.chat.untitled")}</option>)}</select><button type="button" className="btn btn-primary" disabled={!sessionId} onClick={async () => { if (!client) return; await client.send("/v1/shares", "POST", { sessionId }); await load(); }}><IconPlus /> {t("aiw.sharing.createAction")}</button></div></section>
        {error && <Notice tone="err">{error}</Notice>}
        {shares.length === 0 ? <EmptyState icon={<IconLink />} title={t("aiw.sharing.empty")} /> : <section className="panel aiw-table-wrap"><table className="tbl"><thead><tr><th>{t("aiw.sharing.link")}</th><th>{t("aiw.sharing.created")}</th></tr></thead><tbody>{shares.map(share => <tr key={share.id}><td><a href={share.url} target="_blank" rel="noreferrer"><code>{share.url}</code></a></td><td>{new Date(share.createdAt).toLocaleString()}</td></tr>)}</tbody></table></section>}
      </div>
    </PageFrame>
  );
}
