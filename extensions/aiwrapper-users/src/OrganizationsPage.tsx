import { useEffect, useState } from "react";
import { IconPlus } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { EmptyState, Notice } from "../../../apps/opencodex-gui/src/ui";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";

interface Organization { id: string; name: string; memberCount: number; quotaPercent: number }

export default function OrganizationsPage() {
  const { client } = useAIWrapper();
  const t = useT();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const load = async () => {
    if (!client) return;
    try { setOrganizations((await client.get<{ data: Organization[] }>("/admin/organizations")).data); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  useEffect(() => { void load(); }, [client]);
  return (
    <PageFrame title="aiw.organizations.title" subtitle="aiw.organizations.subtitle">
      <div className="aiw-stack">
        <section className="panel"><div className="panel-head"><h3 className="panel-title">{t("aiw.organizations.create")}</h3></div><div className="aiw-toolbar"><input className="input" value={name} placeholder={t("aiw.organizations.name")} onChange={event => setName(event.target.value)} /><button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={async () => { if (!client) return; await client.send("/admin/organizations", "POST", { name }); setName(""); await load(); }}><IconPlus /> {t("aiw.organizations.createAction")}</button></div></section>
        {error && <Notice tone="err">{error}</Notice>}
        {organizations.length === 0 ? <EmptyState title={t("aiw.organizations.empty")} /> : <section className="panel aiw-table-wrap"><table className="tbl"><thead><tr><th>{t("aiw.organizations.name")}</th><th>{t("aiw.organizations.members")}</th><th>{t("aiw.organizations.quota")}</th></tr></thead><tbody>{organizations.map(organization => <tr key={organization.id}><td>{organization.name}</td><td>{organization.memberCount}</td><td>{organization.quotaPercent}%</td></tr>)}</tbody></table></section>}
      </div>
    </PageFrame>
  );
}
