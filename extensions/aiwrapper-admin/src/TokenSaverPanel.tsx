import { useEffect, useState } from "react";
import { useKeyedClientResource } from "../../../apps/opencodex-gui/src/client-resource";
import { IconSparkle } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { Select, Switch } from "../../../apps/opencodex-gui/src/ui";
import { useAIWrapper } from "./auth";

type TokenSaverSettings = {
  rtkEnabled: boolean;
  environmentEnabled: boolean;
  effectiveEnabled: boolean;
  cavemanEnabled: boolean;
  cavemanLevel: string;
  ponytailEnabled: boolean;
  ponytailLevel: string;
  headroomEnabled: boolean;
  headroomUrl: string;
  headroomCompressUserMessages: boolean;
};

type HeadroomStatus = { url: string; running: boolean };

const CAVEMAN_LEVELS = ["lite", "full", "ultra", "wenyan-lite", "wenyan", "wenyan-ultra"];
const PONYTAIL_LEVELS = ["lite", "full", "ultra"];

export default function TokenSaverPanel() {
  const t = useT();
  const { client, principal } = useAIWrapper();
  const [rtkEnabled, setRtkEnabledState] = useState(true);
  const [cavemanEnabled, setCavemanEnabled] = useState(false);
  const [cavemanLevel, setCavemanLevel] = useState("full");
  const [ponytailEnabled, setPonytailEnabled] = useState(false);
  const [ponytailLevel, setPonytailLevel] = useState("full");
  const [headroomEnabled, setHeadroomEnabled] = useState(false);
  const [headroomUrl, setHeadroomUrl] = useState("http://localhost:8787");
  const [headroomCompressUserMessages, setHeadroomCompressUserMessages] = useState(false);
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
  const headroomResource = useKeyedClientResource<HeadroomStatus>(
    `aiwrapper-headroom-status:${principal?.userId ?? "anonymous"}`,
    [client, principal?.userId],
    async () => {
      if (!client) throw new Error(t("aiw.overview.notConnected"));
      return client.get<HeadroomStatus>("/admin/token-saver/headroom-status");
    },
    { enabled: Boolean(client && isAdministrator), pollMs: 30_000 },
  );

  useEffect(() => {
    if (resource.data) {
      setRtkEnabledState(resource.data.rtkEnabled);
      setCavemanEnabled(resource.data.cavemanEnabled);
      setCavemanLevel(resource.data.cavemanLevel);
      setPonytailEnabled(resource.data.ponytailEnabled);
      setPonytailLevel(resource.data.ponytailLevel);
      setHeadroomEnabled(resource.data.headroomEnabled);
      setHeadroomUrl(resource.data.headroomUrl);
      setHeadroomCompressUserMessages(resource.data.headroomCompressUserMessages);
    }
  }, [resource.data]);

  if (!client || !isAdministrator) return null;

  const savePatch = async (patch: Partial<TokenSaverSettings>) => {
    setSaving(true);
    setSaveError("");
    try {
      const updated = await client.send<TokenSaverSettings>("/admin/token-saver", "PATCH", patch);
      setRtkEnabledState(updated.rtkEnabled);
      setCavemanEnabled(updated.cavemanEnabled);
      setCavemanLevel(updated.cavemanLevel);
      setPonytailEnabled(updated.ponytailEnabled);
      setPonytailLevel(updated.ponytailLevel);
      setHeadroomEnabled(updated.headroomEnabled);
      setHeadroomUrl(updated.headroomUrl);
      setHeadroomCompressUserMessages(updated.headroomCompressUserMessages);
      resource.refresh();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const environmentLocked = resource.data?.environmentEnabled === false;
  const effectiveRtk = rtkEnabled && !environmentLocked;
  return (
    <section className="aiw-token-saver card" aria-labelledby="aiw-token-saver-title">
      <header className="aiw-token-saver__head">
        <div className="aiw-token-saver__icon"><IconSparkle aria-hidden /></div>
        <div className="aiw-token-saver__copy">
          <h3 id="aiw-token-saver-title">{t("aiw.tokenSaver.title")}</h3>
          <p>{t("aiw.tokenSaver.description")}</p>
        </div>
      </header>
      <div className="aiw-token-saver__feature">
        <div className="aiw-token-saver__copy">
          <div className="aiw-token-saver__title-row">
            <strong>RTK</strong>
            <span className={`badge ${effectiveRtk ? "badge-green" : "badge-muted"}`}>
              {effectiveRtk ? t("aiw.tokenSaver.active") : t("aiw.tokenSaver.inactive")}
            </span>
          </div>
          <p>{t("aiw.tokenSaver.rtkDescription")}</p>
          <a href="https://github.com/rtk-ai/rtk" target="_blank" rel="noreferrer">{t("aiw.tokenSaver.learnMore")}</a>
          {environmentLocked ? <div className="notice notice-warn" role="status">{t("aiw.tokenSaver.environmentLocked")}</div> : null}
        </div>
        <Switch
          on={effectiveRtk}
          onClick={() => void savePatch({ rtkEnabled: !rtkEnabled })}
          disabled={saving || resource.loading || environmentLocked}
          label={t("aiw.tokenSaver.toggle")}
        />
      </div>
      <div className="aiw-token-saver__feature aiw-token-saver__feature--headroom">
        <div className="aiw-token-saver__copy">
          <div className="aiw-token-saver__title-row">
            <strong>Headroom</strong>
            <span className={`badge ${headroomResource.data?.running ? "badge-green" : "badge-muted"}`}>
              {headroomResource.loading ? t("aiw.tokenSaver.checking") : headroomResource.data?.running ? t("aiw.tokenSaver.reachable") : t("aiw.tokenSaver.unreachable")}
            </span>
          </div>
          <p>{t("aiw.tokenSaver.headroomDescription")}</p>
          <div className="aiw-token-saver__url">
            <input className="input" value={headroomUrl} onChange={event => setHeadroomUrl(event.target.value)} aria-label={t("aiw.tokenSaver.headroomUrl")} />
            <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void savePatch({ headroomUrl: headroomUrl.trim() })}>{t("common.save")}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={headroomResource.loading} onClick={() => headroomResource.refresh()}>{t("aiw.tokenSaver.check")}</button>
          </div>
          <label className="aiw-token-saver__checkbox">
            <input type="checkbox" checked={headroomCompressUserMessages} onChange={event => void savePatch({ headroomCompressUserMessages: event.target.checked })} disabled={saving} />
            {t("aiw.tokenSaver.compressUserMessages")}
          </label>
        </div>
        <Switch on={headroomEnabled} onClick={() => void savePatch({ headroomEnabled: !headroomEnabled })} disabled={saving || resource.loading} label={t("aiw.tokenSaver.headroom")} />
      </div>
      <div className="aiw-token-saver__feature">
        <div className="aiw-token-saver__copy">
          <strong>{t("aiw.tokenSaver.caveman")}</strong>
          <p>{t("aiw.tokenSaver.cavemanDescription")}</p>
        </div>
        <div className="aiw-token-saver__controls">
          <Select
            value={cavemanLevel}
            options={CAVEMAN_LEVELS.map(value => ({ value, label: value }))}
            onChange={value => void savePatch({ cavemanLevel: value })}
            disabled={saving || !cavemanEnabled}
            label={t("aiw.tokenSaver.level")}
          />
          <Switch on={cavemanEnabled} onClick={() => void savePatch({ cavemanEnabled: !cavemanEnabled })} disabled={saving || resource.loading} label={t("aiw.tokenSaver.caveman")} />
        </div>
      </div>
      <div className="aiw-token-saver__feature">
        <div className="aiw-token-saver__copy">
          <strong>{t("aiw.tokenSaver.ponytail")}</strong>
          <p>{t("aiw.tokenSaver.ponytailDescription")}</p>
        </div>
        <div className="aiw-token-saver__controls">
          <Select
            value={ponytailLevel}
            options={PONYTAIL_LEVELS.map(value => ({ value, label: value }))}
            onChange={value => void savePatch({ ponytailLevel: value })}
            disabled={saving || !ponytailEnabled}
            label={t("aiw.tokenSaver.level")}
          />
          <Switch on={ponytailEnabled} onClick={() => void savePatch({ ponytailEnabled: !ponytailEnabled })} disabled={saving || resource.loading} label={t("aiw.tokenSaver.ponytail")} />
        </div>
      </div>
      {saveError || resource.error ? <div className="notice notice-err" role="alert">{saveError || String(resource.error)}</div> : null}
    </section>
  );
}
