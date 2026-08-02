import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconKey, IconTerminal } from "../../../apps/opencodex-gui/src/icons";
import { useCopyFeedback } from "../../../apps/opencodex-gui/src/components/use-copy-feedback";
import { useKeyedClientResource } from "../../../apps/opencodex-gui/src/client-resource";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";
import type { ModelRecord } from "../../aiwrapper-admin/src/client";
import { buildCodexManualConfigs, buildOpenAIEnvironment, type ManualConfig } from "./nine-router-codex-config";
import "./styles.css";

function CopyConfigButton({ config }: { config: ManualConfig }) {
  const t = useT();
  const { copy, outcomeFor } = useCopyFeedback<string>();
  const outcome = outcomeFor(config.filename);
  return (
    <button type="button" className="btn btn-sm btn-ghost" onClick={() => copy(config.content, config.filename)}>
      {outcome === "copied" ? <IconCheck /> : null}
      {outcome === "copied" ? t("aiw.connections.copied") : outcome === "unavailable" ? t("aiw.connections.copyUnavailable") : t("aiw.connections.copy")}
    </button>
  );
}

export default function ConnectionsPage() {
  const t = useT();
  const { client, baseUrl } = useAIWrapper();
  const [endpoint, setEndpoint] = useState(baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [subagentModel, setSubagentModel] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const environmentCopy = useCopyFeedback<string>();
  const models = useKeyedClientResource<{ data: ModelRecord[] }>(
    `aiwrapper-connection-models:${client?.baseUrl ?? "anonymous"}`,
    [client],
    async () => client ? client.get<{ data: ModelRecord[] }>("/v1/models") : { data: [] },
    { enabled: Boolean(client) },
  );

  useEffect(() => {
    if (!model && models.data?.data[0]?.id) setModel(models.data.data[0].id);
  }, [model, models.data?.data]);

  const configs = useMemo(
    () => buildCodexManualConfigs({ baseUrl: endpoint, apiKey, model, subagentModel }),
    [apiKey, endpoint, model, subagentModel],
  );
  const environment = useMemo(() => buildOpenAIEnvironment({ baseUrl: endpoint, apiKey }), [apiKey, endpoint]);
  const environmentOutcome = environmentCopy.outcomeFor("environment");

  return (
    <PageFrame title="aiw.connections.title" subtitle="aiw.connections.subtitle">
      <div className="aiw-connections-grid">
        <section className="card aiw-connections-setup">
          <div className="aiw-connections-card-title"><IconTerminal /><div><h3>{t("aiw.connections.codexTitle")}</h3><p>{t("aiw.connections.codexDescription")}</p></div></div>
          <ol className="aiw-connections-steps">
            <li><span>1</span><label><strong>{t("aiw.connections.endpoint")}</strong><input className="input" type="url" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://aiwrapper.example.com" />{/(?:127\.0\.0\.1|localhost)/i.test(endpoint) ? <small>{t("aiw.connections.loopbackHint")}</small> : null}</label></li>
            <li><span>2</span><label><strong>{t("aiw.connections.individualKey")}</strong><input className="input" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="aiw_…" /></label></li>
            <li><span>3</span><label><strong>{t("aiw.connections.model")}</strong><input className="input" list="aiwrapper-connection-models" value={model} onChange={(event) => setModel(event.target.value)} placeholder={models.loading ? t("aiw.connections.loadingModels") : "provider/model-id"} /><datalist id="aiwrapper-connection-models">{(models.data?.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.displayName ?? item.id}</option>)}</datalist>{models.error ? <small>{t("aiw.connections.modelsUnavailable")}</small> : null}</label></li>
            <li><span>4</span><label><strong>{t("aiw.connections.subagentModel")}</strong><input className="input" list="aiwrapper-connection-models" value={subagentModel} onChange={(event) => setSubagentModel(event.target.value)} placeholder={model || t("aiw.connections.sameAsDefault")} /><small>{t("aiw.connections.subagentHint")}</small></label></li>
          </ol>
          <div className="notice notice-warn"><IconKey /> {t("aiw.connections.memoryOnly")}</div>
        </section>

        <section className="card aiw-connections-configs">
          <header><div><h3>{t("aiw.connections.filesTitle")}</h3><p>{t("aiw.connections.filesDescription")}</p></div><button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowSecret((value) => !value)}>{showSecret ? t("aiw.connections.hideSecret") : t("aiw.connections.showSecret")}</button></header>
          {configs.map((config) => <article key={config.filename}><div><strong>{config.filename}</strong><CopyConfigButton config={config} /></div><pre>{config.containsSecret && !showSecret ? config.content.replace(apiKey.trim() || "<YOUR_INDIVIDUAL_AIWRAPPER_KEY>", "••••••••••••••••") : config.content}</pre></article>)}
        </section>

        <section className="card aiw-connections-environment">
          <div><h3>{t("aiw.connections.environmentTitle")}</h3><p>{t("aiw.connections.environmentDescription")}</p></div>
          <pre>{showSecret ? environment : environment.replace(apiKey.trim() || "<YOUR_INDIVIDUAL_AIWRAPPER_KEY>", "••••••••••••••••")}</pre>
          <button type="button" className="btn btn-sm" onClick={() => environmentCopy.copy(environment, "environment")}>{environmentOutcome === "copied" ? t("aiw.connections.copied") : environmentOutcome === "unavailable" ? t("aiw.connections.copyUnavailable") : t("aiw.connections.copyEnvironment")}</button>
        </section>
      </div>
    </PageFrame>
  );
}
