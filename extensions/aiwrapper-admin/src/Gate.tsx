import { useState, type ReactNode } from "react";
import { IconKey } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { Notice } from "../../../apps/opencodex-gui/src/ui";
import { useAIWrapper } from "./auth";

export function AIWrapperGate({ children }: { children: ReactNode }) {
  const { principal, baseUrl, connect } = useAIWrapper();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = useT();

  if (principal) return children;
  return (
    <section className="aiw-gate panel">
      <IconKey aria-hidden />
      <h2>{t("aiw.connect.title")}</h2>
      <p className="page-sub">{t("aiw.connect.description")}</p>
      <label className="aiw-field">
        <span>{t("aiw.connect.key")}</span>
        <input
          className="input"
          type="password"
          autoComplete="off"
          value={token}
          placeholder="aiw_…"
          onChange={event => setToken(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && token.trim()) event.currentTarget.form?.requestSubmit();
          }}
        />
      </label>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || !token.trim()}
        onClick={async () => {
          setBusy(true);
          setError("");
          try { await connect(token); }
          catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
          finally { setBusy(false); }
        }}
      >
        {busy ? t("aiw.connect.connecting") : t("aiw.connect.action")}
      </button>
      <code className="aiw-endpoint">{baseUrl}</code>
      {error && <Notice tone="err">{error}</Notice>}
    </section>
  );
}
