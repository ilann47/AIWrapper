import { useKeyedClientResource } from "../../../apps/opencodex-gui/src/client-resource";
import { IconActivity, IconBot, IconBoxes, IconRefresh } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { useAIWrapper } from "./auth";

interface MultiAuthMonitor {
  command: "monitor";
  project: { projectKey: string | null; hasProfile: boolean; budgetKey: string | null };
  accounts: { count: number; policyCount: number };
  runtime: null | {
    responsesRequests: number;
    runtimeMetrics: { failedRequests: number; accountRotations: number };
  };
  usage: { totals: { requests: number; totalTokens: number } };
  budgetGuardCount: number;
  routingProfile: null | { projectName: string; preferredTags: string[]; avoidTags: string[] };
  modelMatrix: { models: string[]; entries: number; available: number; unavailable: number };
  quotaCache: { byAccountId: number; byEmail: number };
}

export default function MultiAuthMonitorPanel() {
  const t = useT();
  const { client, principal } = useAIWrapper();
  const isAdministrator = principal?.role === "admin" || principal?.role === "owner";
  const monitor = useKeyedClientResource<MultiAuthMonitor>(
    `aiwrapper-multi-auth-monitor:${principal?.userId ?? "anonymous"}`,
    [client, principal?.userId],
    async () => {
      if (!client) throw new Error(t("aiw.multiAuth.notConnected"));
      return client.get<MultiAuthMonitor>("/admin/multi-auth/monitor");
    },
    { enabled: Boolean(client && isAdministrator), pollMs: 15_000 },
  );

  if (!client || !isAdministrator) return null;
  const data = monitor.data;
  const routing = data?.routingProfile;

  return (
    <section className="aiw-admin-overview" aria-labelledby="aiw-multi-auth-monitor-title">
      <div className="aiw-admin-overview__head">
        <div>
          <h3 id="aiw-multi-auth-monitor-title">{t("aiw.multiAuth.title")}</h3>
          <p>{t("aiw.multiAuth.subtitle")}</p>
        </div>
        <button className="btn btn-sm" type="button" onClick={() => monitor.refresh()} disabled={monitor.loading}>
          <IconRefresh /> {monitor.loading ? t("aiw.overview.refreshing") : t("aiw.overview.refresh")}
        </button>
      </div>
      {monitor.error ? <div className="notice notice-err" role="alert">{String(monitor.error)}</div> : null}
      <div className="stat-row">
        <div className="stat"><div className="label"><IconBot /> {t("aiw.multiAuth.accounts")}</div><div className="value">{data?.accounts.count ?? "â€”"}</div><small>{t("aiw.multiAuth.policies", { count: data?.accounts.policyCount ?? 0 })}</small></div>
        <div className="stat"><div className="label"><IconBoxes /> {t("aiw.multiAuth.models")}</div><div className="value">{data ? `${data.modelMatrix.available}/${data.modelMatrix.entries}` : "â€”"}</div><small>{t("aiw.multiAuth.catalog", { count: data?.modelMatrix.models.length ?? 0 })}</small></div>
        <div className="stat"><div className="label"><IconActivity /> {t("aiw.multiAuth.runtime")}</div><div className="value">{data?.runtime?.responsesRequests ?? 0}</div><small>{t("aiw.multiAuth.failures", { count: data?.runtime?.runtimeMetrics.failedRequests ?? 0 })}</small></div>
        <div className="stat"><div className="label">{t("aiw.multiAuth.budgets")}</div><div className="value">{data?.budgetGuardCount ?? "â€”"}</div><small>{t("aiw.multiAuth.ledgerRequests", { count: data?.usage.totals.requests ?? 0 })}</small></div>
        <div className="stat"><div className="label">{t("aiw.multiAuth.quotaCache")}</div><div className="value">{data ? data.quotaCache.byAccountId + data.quotaCache.byEmail : "â€”"}</div><small>{t("aiw.multiAuth.cachedIdentities")}</small></div>
        <div className="stat"><div className="label">{t("aiw.multiAuth.routing")}</div><div className="value">{routing ? routing.projectName : t("aiw.multiAuth.defaultRouting")}</div><small>{data?.project.projectKey ?? "â€”"}</small></div>
      </div>
      {data && data.accounts.count === 0 ? <div className="notice" role="status">{t("aiw.multiAuth.empty")}</div> : null}
    </section>
  );
}
