import { useEffect, useState, type CSSProperties } from "react";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { Notice } from "../../../apps/opencodex-gui/src/ui";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";
import { OverviewCards, UsageChart, UsageTable, type UsageBucket } from "./nine-router-usage";

interface UsageSummary { weighted_units?:number; weightedUnits?:number; request_count?:number; requests?:number; quota_percent?:number; quotaPercent?:number; used_percent?:number; usedPercent?:number; windows?:Record<string,{used:number;limit:number}>; tokens?:UsageBucket; models?:UsageBucket[]; days?:UsageBucket[]; outcomes?:UsageBucket[] }

export default function BillingPage() {
  const {client}=useAIWrapper(); const t=useT(); const [usage,setUsage]=useState<UsageSummary>({}); const [error,setError]=useState("");
  useEffect(()=>{if(!client)return; void client.get<UsageSummary>("/v1/me/usage").then(setUsage).catch(reason=>setError(reason instanceof Error?reason.message:String(reason)));},[client]);
  const units=Number(usage.weighted_units??usage.weightedUnits??0); const requests=Number(usage.request_count??usage.requests??0); const quota=Number(usage.quota_percent??usage.quotaPercent??0); const used=Number(usage.used_percent??usage.usedPercent??0); const tokens=usage.tokens;
  const failures=(usage.outcomes??[]).filter(item=>item.key==="failure"||item.key==="blocked").reduce((sum,item)=>sum+item.requests,0);
  const stats={totalRequests:requests,totalPromptTokens:tokens?.inputTokens??0,totalCachedTokens:tokens?.cachedInputTokens??0,totalCompletionTokens:tokens?.outputTokens??0,totalCost:tokens?.costUsd??0};
  return <PageFrame title="aiw.billing.title" subtitle="aiw.billing.subtitle">{error&&<Notice tone="err">{error}</Notice>}
    <div className="aiw-usage-hero"><div><span>{t("aiw.billing.used")}</span><strong>{used}%</strong><small>{units.toLocaleString()} {t("aiw.billing.units").toLowerCase()}</small></div><div className="aiw-quota-ring" style={{"--quota":`${Math.min(100,used)*3.6}deg`} as CSSProperties}><span>{quota}%</span><small>{t("aiw.billing.quota")}</small></div><div className="aiw-outcome"><span>{t("aiw.analytics.health")}</span><strong>{failures===0?t("aiw.analytics.healthy"):t("aiw.analytics.issues",{count:String(failures)})}</strong><small>{requests.toLocaleString()} {t("aiw.billing.requests").toLowerCase()}</small></div></div>
    <div className="aiw-window-grid">{Object.entries(usage.windows??{}).map(([label,window])=>{const percent=window.limit?Math.min(100,window.used/window.limit*100):0;return <section className="card" key={label}><div><strong>{label}</strong><span>{window.used.toLocaleString()} / {window.limit.toLocaleString()}</span></div><div className="aiw-progress"><span style={{width:`${percent}%`}} /></div><small>{t("aiw.analytics.percentUsed",{percent:percent.toFixed(1)})}</small></section>;})}</div>
    <OverviewCards stats={stats}/><div className="aiw-usage-grid"><UsageChart data={usage.days??[]}/><UsageTable buckets={usage.models??[]}/></div><p className="page-sub">{t("aiw.billing.note")}</p>
  </PageFrame>;
}
