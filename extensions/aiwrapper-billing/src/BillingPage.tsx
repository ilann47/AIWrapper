import { useEffect, useState } from "react";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { Notice } from "../../../apps/opencodex-gui/src/ui";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";

interface UsageSummary { weighted_units?: number; weightedUnits?: number; request_count?: number; requests?: number; quota_percent?: number; quotaPercent?: number; used_percent?: number; usedPercent?: number }

export default function BillingPage() {
  const { client } = useAIWrapper();
  const t = useT();
  const [usage, setUsage] = useState<UsageSummary>({});
  const [error, setError] = useState("");
  useEffect(() => {
    if (!client) return;
    void client.get<UsageSummary>("/v1/me/usage").then(setUsage).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [client]);
  const units = Number(usage.weighted_units ?? usage.weightedUnits ?? 0);
  const requests = Number(usage.request_count ?? usage.requests ?? 0);
  const quota = Number(usage.quota_percent ?? usage.quotaPercent ?? 0);
  const used = Number(usage.used_percent ?? usage.usedPercent ?? 0);
  return (
    <PageFrame title="aiw.billing.title" subtitle="aiw.billing.subtitle">
      {error && <Notice tone="err">{error}</Notice>}
      <div className="aiw-stats">
        <section className="stat"><span className="label">{t("aiw.billing.units")}</span><strong className="value">{units.toLocaleString()}</strong></section>
        <section className="stat"><span className="label">{t("aiw.billing.requests")}</span><strong className="value">{requests.toLocaleString()}</strong></section>
        <section className="stat"><span className="label">{t("aiw.billing.quota")}</span><strong className="value">{quota}%</strong></section>
        <section className="stat"><span className="label">{t("aiw.billing.used")}</span><strong className="value">{used}%</strong></section>
      </div>
      <p className="page-sub">{t("aiw.billing.note")}</p>
    </PageFrame>
  );
}
