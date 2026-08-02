import { useKeyedClientResource } from "../../../apps/opencodex-gui/src/client-resource";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { useAIWrapper } from "./auth";

type Totals = {
  requests?: number;
  totalTokens?: number;
  failures?: number;
  blocked?: number;
};

type AdminOverview = {
  counts: { users: number; conversations: number; messages: number; shares: number };
  runtime: { active: number; queued: number; limit: number };
  usage: { totals?: Totals; latency?: { averageMs: number; p95Ms: number; measuredRequests: number } };
  throughputPerMinute: number;
};

function formatDuration(value?: number) {
  if (value === undefined) return "—";
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(1)} s`;
}

export default function AdminOverviewPanel() {
  const t = useT();
  const { client, principal } = useAIWrapper();
  const isAdministrator = principal?.role === "admin" || principal?.role === "owner";
  const resource = useKeyedClientResource<AdminOverview>(
    `aiwrapper-admin-overview:${principal?.userId ?? "anonymous"}`,
    [client, principal?.userId],
    async () => {
      if (!client) throw new Error(t("aiw.overview.notConnected"));
      return client.get<AdminOverview>("/admin/overview");
    },
    { enabled: Boolean(client && isAdministrator), pollMs: 10_000 },
  );

  if (!client || !isAdministrator) return null;
  const totals = resource.data?.usage.totals;
  return (
    <section className="aiw-admin-overview" aria-labelledby="aiw-admin-overview-title">
      <div className="aiw-admin-overview__head">
        <div>
          <h3 id="aiw-admin-overview-title">{t("aiw.overview.title")}</h3>
          <p>{t("aiw.overview.subtitle")}</p>
        </div>
        <button className="btn btn-sm" type="button" onClick={() => resource.refresh()} disabled={resource.loading}>
          {resource.loading ? t("aiw.overview.refreshing") : t("aiw.overview.refresh")}
        </button>
      </div>
      {resource.error ? <div className="notice notice-err" role="alert">{String(resource.error)}</div> : null}
      <div className="stat-row">
        <div className="stat"><div className="label">{t("aiw.overview.users")}</div><div className="value">{resource.data?.counts.users ?? "—"}</div></div>
        <div className="stat"><div className="label">{t("aiw.overview.conversations")}</div><div className="value">{resource.data?.counts.conversations ?? "—"}</div></div>
        <div className="stat"><div className="label">{t("aiw.overview.active")}</div><div className="value">{resource.data?.runtime.active ?? "—"}</div></div>
        <div className="stat"><div className="label">{t("aiw.overview.queue")}</div><div className="value">{resource.data?.runtime.queued ?? "—"}</div></div>
        <div className="stat"><div className="label">{t("aiw.overview.requests")}</div><div className="value">{totals?.requests ?? "—"}</div></div>
        <div className="stat"><div className="label">{t("aiw.overview.throughput")}</div><div className="value mono">{resource.data?.throughputPerMinute ?? "—"}</div></div>
        <div className="stat"><div className="label">{t("aiw.overview.averageLatency")}</div><div className="value mono">{formatDuration(resource.data?.usage.latency?.averageMs)}</div></div>
        <div className="stat"><div className="label">{t("aiw.overview.p95Latency")}</div><div className="value mono">{formatDuration(resource.data?.usage.latency?.p95Ms)}</div></div>
        <div className="stat"><div className="label">{t("aiw.overview.errors")}</div><div className="value">{totals?.failures ?? 0}</div></div>
        <div className="stat"><div className="label">{t("aiw.overview.blocked")}</div><div className="value">{totals?.blocked ?? 0}</div></div>
      </div>
    </section>
  );
}
