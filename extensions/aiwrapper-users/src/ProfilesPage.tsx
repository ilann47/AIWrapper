import { IconHardDrive, IconRefresh, IconTerminal } from "../../../apps/opencodex-gui/src/icons";
import { useKeyedClientResource } from "../../../apps/opencodex-gui/src/client-resource";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { EmptyState, Notice } from "../../../apps/opencodex-gui/src/ui";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";
import "./styles.css";

interface ProfileStatus {
  name: string;
  home: string;
  state: "ok" | "not_initialized" | "not_logged_in" | "error";
  status: string;
  exit_code: number;
}

interface ProfileDiagnostics {
  commandExitCode: number;
  cli: { found: boolean; path: string | null; version: string | null; source: string | null; healthy: boolean };
  status: { skipped: boolean; reason?: string; profiles?: ProfileStatus[] };
  workspaces: { guard_mode: string | null; registry_valid: boolean; binding_count: number; missing_paths: number; missing_profiles: number };
}

function stateTone(state: ProfileStatus["state"]): string {
  if (state === "ok") return "badge-green";
  if (state === "error") return "badge-red";
  return "badge-muted";
}

export default function ProfilesPage() {
  const t = useT();
  const { client } = useAIWrapper();
  const diagnostics = useKeyedClientResource<ProfileDiagnostics>(
    `aiwrapper-profile-diagnostics:${client?.baseUrl ?? "anonymous"}`,
    [client],
    async () => {
      if (!client) throw new Error(t("aiw.profiles.notConnected"));
      return client.get<ProfileDiagnostics>("/admin/profiles");
    },
    { enabled: Boolean(client) },
  );
  const data = diagnostics.data;
  const profiles = data?.status.profiles ?? [];

  return (
    <PageFrame title="aiw.profiles.title" subtitle="aiw.profiles.subtitle">
      <div className="aiw-stack">
        <div className="aiw-profile-actions"><button type="button" className="btn btn-sm btn-ghost" disabled={diagnostics.loading} onClick={() => diagnostics.refresh({ forceLoading: true })}><IconRefresh /> {t("common.retry")}</button></div>
        {diagnostics.error ? <Notice tone="err">{diagnostics.error instanceof Error ? diagnostics.error.message : String(diagnostics.error)}</Notice> : null}
        <section className="stat-row aiw-profile-stats">
          <article className="stat"><span className="label"><IconTerminal />{t("aiw.profiles.cli")}</span><strong className="value">{data?.cli.found ? data.cli.version ?? t("aiw.profiles.available") : t("aiw.profiles.unavailable")}</strong><small>{data?.cli.path ?? data?.status.reason ?? "—"}</small></article>
          <article className="stat"><span className="label"><IconHardDrive />{t("aiw.profiles.workspaceBindings")}</span><strong className="value">{data?.workspaces.binding_count ?? 0}</strong><small>{data?.workspaces.registry_valid === false ? t("aiw.profiles.registryInvalid") : t("aiw.profiles.guard", { mode: data?.workspaces.guard_mode ?? "off" })}</small></article>
          <article className="stat"><span className="label"><IconRefresh />{t("aiw.profiles.health")}</span><strong className="value">{data?.cli.healthy ? t("aiw.profiles.healthy") : t("aiw.profiles.needsAttention")}</strong><small>{t("aiw.profiles.missingReferences", { paths: String(data?.workspaces.missing_paths ?? 0), profiles: String(data?.workspaces.missing_profiles ?? 0) })}</small></article>
        </section>
        <section className="panel">
          <div className="panel-head"><div><h3 className="panel-title">{t("aiw.profiles.list")}</h3><p>{t("aiw.profiles.listDescription")}</p></div></div>
          {diagnostics.loading && !data ? <EmptyState title={t("common.loading")} /> : profiles.length === 0 ? <EmptyState title={t("aiw.profiles.empty")}><span>{data?.status.reason ?? t("aiw.profiles.emptyHint")}</span></EmptyState> : <div className="aiw-table-wrap"><table className="tbl"><thead><tr><th>{t("aiw.profiles.name")}</th><th>{t("aiw.profiles.state")}</th><th>{t("aiw.profiles.home")}</th><th>{t("aiw.profiles.status")}</th></tr></thead><tbody>{profiles.map((profile) => <tr key={profile.name}><td><strong>{profile.name}</strong></td><td><span className={`badge ${stateTone(profile.state)}`}>{profile.state.replaceAll("_", " ")}</span></td><td><code>{profile.home}</code></td><td>{profile.status}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </PageFrame>
  );
}
