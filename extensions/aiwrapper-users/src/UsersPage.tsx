import { useEffect, useState } from "react";
import { IconPlus, IconRefresh } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { EmptyState, Notice, Select } from "../../../apps/opencodex-gui/src/ui";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";

interface UserRecord {
  id: string;
  name: string;
  status: string;
  role: string;
  profile_id?: string;
  profile_name?: string;
  backend_id?: string;
  weighted_units?: number;
  quota_5h?: number;
  quota_7d?: number;
}

function UserRow({ user, save }: { user: UserRecord; save: (userId: string, quota5h: number, quota7d: number) => Promise<void> }) {
  const t = useT();
  const [quota5h, setQuota5h] = useState(user.quota_5h ?? 100000);
  const [quota7d, setQuota7d] = useState(user.quota_7d ?? 500000);
  return <tr><td>{user.name}</td><td>{user.role}</td><td><span className={`badge ${user.status === "active" ? "badge-green" : "badge-muted"}`}>{user.status}</span></td><td><code>{user.profile_name ?? user.profile_id ?? "—"}</code></td><td>{Number(user.weighted_units ?? 0).toLocaleString()}</td><td><input className="input aiw-quota-input" aria-label={t("aiw.users.quota5h")} type="number" min="1" value={quota5h} onChange={event => setQuota5h(Number(event.target.value))} /></td><td><input className="input aiw-quota-input" aria-label={t("aiw.users.quota7d")} type="number" min="1" value={quota7d} onChange={event => setQuota7d(Number(event.target.value))} /></td><td><button type="button" className="btn btn-ghost btn-sm" onClick={() => void save(user.id, quota5h, quota7d)}>{t("common.save")}</button></td></tr>;
}

export default function UsersPage() {
  const { client } = useAIWrapper();
  const t = useT();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("user");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    if (!client) return;
    try { setUsers((await client.get<{ data: UserRecord[] }>("/admin/users")).data); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  useEffect(() => { void load(); }, [client]);

  const create = async () => {
    if (!client) return;
    try {
      const result = await client.send<{ apiKey?: { secret?: string }; secret?: string }>("/admin/users", "POST", { name, role });
      setSecret(result.apiKey?.secret ?? result.secret ?? "");
      setName("");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return (
    <PageFrame title="aiw.users.title" subtitle="aiw.users.subtitle">
      <div className="aiw-stack">
        <section className="panel">
          <div className="panel-head"><h3 className="panel-title">{t("aiw.users.create")}</h3></div>
          <div className="aiw-form-grid">
            <label className="aiw-field"><span>{t("aiw.users.name")}</span><input className="input" value={name} onChange={event => setName(event.target.value)} /></label>
            <label className="aiw-field"><span>{t("aiw.users.role")}</span><Select value={role} options={["user", "operator", "admin"].map(value => ({ value, label: value }))} onChange={setRole} /></label>
            <div className="aiw-field"><span>{t("aiw.users.profile")}</span><small>{t("aiw.users.profileAutomatic")}</small></div>
          </div>
          <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={() => void create()}><IconPlus /> {t("aiw.users.createAction")}</button>
          {secret && <code className="aiw-secret">{secret}</code>}
        </section>
        <section className="panel">
          <div className="panel-head"><h3 className="panel-title">{t("aiw.users.list")}</h3><button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}><IconRefresh /> {t("common.retry")}</button></div>
          {error && <Notice tone="err">{error}</Notice>}
          {users.length === 0 ? <EmptyState title={t("aiw.users.empty")} /> : <div className="aiw-table-wrap"><table className="tbl"><thead><tr><th>{t("aiw.users.name")}</th><th>{t("aiw.users.role")}</th><th>{t("aiw.users.status")}</th><th>{t("aiw.users.profile")}</th><th>{t("aiw.users.units")}</th><th>{t("aiw.users.quota5h")}</th><th>{t("aiw.users.quota7d")}</th><th /></tr></thead><tbody>{users.map(user => <UserRow key={user.id} user={user} save={async (userId, quota5h, quota7d) => { if (!client) return; await client.send(`/admin/users/${userId}`, "PATCH", { quota_5h: quota5h, quota_7d: quota7d }); await load(); }} />)}</tbody></table></div>}
        </section>
      </div>
    </PageFrame>
  );
}
