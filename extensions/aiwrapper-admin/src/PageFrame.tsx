import type { ReactNode } from "react";
import { useT, type TKey } from "../../../apps/opencodex-gui/src/i18n/shared";
import { useAIWrapper } from "./auth";
import { AIWrapperGate } from "./Gate";

export function PageFrame({ title, subtitle, children }: { title: TKey; subtitle: TKey; children: ReactNode }) {
  const t = useT();
  const { principal, disconnect } = useAIWrapper();
  return (
    <AIWrapperGate>
      <div className="page-head">
        <div>
          <h2>{t(title)}</h2>
          <p className="page-sub">{t(subtitle)}</p>
        </div>
        <div className="aiw-identity">
          <span className="badge badge-muted">{principal?.role}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void disconnect()}>{t("aiw.disconnect")}</button>
        </div>
      </div>
      {children}
    </AIWrapperGate>
  );
}
