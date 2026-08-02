import { useEffect, useState } from "react";
import { useKeyedClientResource } from "../../../apps/opencodex-gui/src/client-resource";
import { IconSparkle } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { Switch } from "../../../apps/opencodex-gui/src/ui";
import { useAIWrapper } from "./auth";

type TokenSaverSettings = {
  rtkEnabled: boolean;
  environmentEnabled: boolean;
  effectiveEnabled: boolean;
};

export default function TokenSaverPanel() {
  const t = useT();
  const { client, principal } = useAIWrapper();
  const [rtkEnabled, setRtkEnabledState] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const isAdministrator = principal?.role === "admin" || principal?.role === "owner";
  const resource = useKeyedClientResource<TokenSaverSettings>(
    `aiwrapper-token-saver:${principal?.userId ?? "anonymous"}`,
    [client, principal?.userId],
    async () => {
      if (!client) throw new Error(t("aiw.overview.notConnected"));
      return client.get<TokenSaverSettings>("/admin/token-saver");
    },
    { enabled: Boolean(client && isAdministrator) },
  );

  useEffect(() => {
    if (resource.data) setRtkEnabledState(resource.data.rtkEnabled);
  }, [resource.data]);

  if (!client || !isAdministrator) return null;

  const handleRtkEnabled = async (value: boolean) => {
    setSaving(true);
    setSaveError("");
    try {
      const updated = await client.send<TokenSaverSettings>("/admin/token-saver", "PATCH", { rtkEnabled: value });
      setRtkEnabledState(updated.rtkEnabled);
      resource.refresh();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const environmentLocked = resource.data?.environmentEnabled === false;
  return (
    <section className="aiw-token-saver card" aria-labelledby="aiw-token-saver-title">
      <div className="aiw-token-saver__icon"><IconSparkle aria-hidden /></div>
      <div className="aiw-token-saver__copy">
        <div className="aiw-token-saver__title-row">
          <h3 id="aiw-token-saver-title">{t("aiw.tokenSaver.title")}</h3>
          <span className={`badge ${resource.data?.effectiveEnabled ? "badge-green" : "badge-muted"}`}>
            {resource.data?.effectiveEnabled ? t("aiw.tokenSaver.active") : t("aiw.tokenSaver.inactive")}
          </span>
        </div>
        <p>{t("aiw.tokenSaver.description")}</p>
        <a href="https://github.com/rtk-ai/rtk" target="_blank" rel="noreferrer">{t("aiw.tokenSaver.learnMore")}</a>
        {environmentLocked ? <div className="notice notice-warn" role="status">{t("aiw.tokenSaver.environmentLocked")}</div> : null}
        {saveError || resource.error ? <div className="notice notice-err" role="alert">{saveError || String(resource.error)}</div> : null}
      </div>
      <Switch
        on={rtkEnabled && !environmentLocked}
        onClick={() => void handleRtkEnabled(!rtkEnabled)}
        disabled={saving || resource.loading || environmentLocked}
        label={t("aiw.tokenSaver.toggle")}
      />
    </section>
  );
}
