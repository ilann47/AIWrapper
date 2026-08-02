import { useEffect, useState } from "react";
import { IconRefresh, IconTrash } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { EmptyState, Notice } from "../../../apps/opencodex-gui/src/ui";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";
import type { SessionRecord } from "../../aiwrapper-admin/src/client";

export default function SessionsPage() {
  const { client } = useAIWrapper();
  const t = useT();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [error, setError] = useState("");
  const load = async () => {
    if (!client) return;
    try { setSessions((await client.get<{ data: SessionRecord[] }>("/v1/sessions")).data); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  useEffect(() => { void load(); }, [client]);
  return (
    <PageFrame title="aiw.sessions.title" subtitle="aiw.sessions.subtitle">
      <div className="aiw-toolbar"><button type="button" className="btn btn-ghost" onClick={() => void load()}><IconRefresh /> {t("common.retry")}</button></div>
      {error && <Notice tone="err">{error}</Notice>}
      {sessions.length === 0 ? <EmptyState title={t("aiw.sessions.empty")} /> : (
        <div className="panel aiw-table-wrap"><table className="tbl"><thead><tr><th>{t("aiw.sessions.name")}</th><th>{t("aiw.chat.model")}</th><th>{t("aiw.sessions.updated")}</th><th /></tr></thead><tbody>
          {sessions.map(session => <tr key={session.id}><td>{session.title || t("aiw.chat.untitled")}</td><td><code>{session.model}</code></td><td>{new Date(session.updatedAt).toLocaleString()}</td><td><button type="button" className="btn btn-danger btn-sm" aria-label={t("aiw.sessions.archive")} onClick={async () => { if (!client) return; await client.send(`/v1/sessions/${session.id}`, "DELETE"); await load(); }}><IconTrash /></button></td></tr>)}
        </tbody></table></div>
      )}
    </PageFrame>
  );
}
