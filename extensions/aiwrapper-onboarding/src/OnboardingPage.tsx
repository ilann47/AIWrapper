import { useEffect, useLayoutEffect } from "react";
import { IconActivity, IconGlobe, IconList, IconTerminal } from "../../../apps/opencodex-gui/src/icons";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import type { Page } from "../../../apps/opencodex-gui/src/app-routing";
import { PageFrame } from "../../aiwrapper-admin/src/PageFrame";
import { ONBOARDING_ACTS, type OnboardingActId } from "./onboarding-acts";
import { selectIsLastStep, selectStep, useOnboardingStore } from "./onboarding-store";
import "./styles.css";

const ACT_ICONS = {
  chat: IconTerminal,
  conversations: IconList,
  usage: IconActivity,
  connections: IconGlobe,
} satisfies Record<OnboardingActId, typeof IconTerminal>;

export default function OnboardingPage(props: {
  userId: string;
  navigateToPage: (page: Page) => void;
}) {
  const { userId, navigateToPage } = props;
  const t = useT();
  const step = useOnboardingStore(selectStep);
  const isLastStep = useOnboardingStore(selectIsLastStep);
  const advanceStep = useOnboardingStore((state) => state.advance);
  const retreat = useOnboardingStore((state) => state.retreat);
  const complete = useOnboardingStore((state) => state.complete);
  const restart = useOnboardingStore((state) => state.restart);
  const act = ONBOARDING_ACTS[step];
  const ActIcon = ACT_ICONS[act.id];

  useLayoutEffect(() => restart(), [restart]);

  const finish = () => {
    complete(userId);
    navigateToPage("aiwrapper-chat");
  };

  const advance = () => {
    if (isLastStep) {
      finish();
      return;
    }
    advanceStep(userId);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea, select")) return;
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        advance();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        retreat();
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <PageFrame title="aiw.onboarding.title" subtitle="aiw.onboarding.subtitle">
      <section className="aiw-onboarding" aria-labelledby="aiw-onboarding-heading">
        <header className="aiw-onboarding__topbar">
          <div className="aiw-onboarding__progress" aria-label={t("aiw.onboarding.progress", { current: String(step + 1), total: String(ONBOARDING_ACTS.length) })}>
            {ONBOARDING_ACTS.map((item, index) => <span key={item.id} className={index <= step ? "active" : ""} />)}
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={finish}>{t("aiw.onboarding.skip")}</button>
        </header>

        <div className="aiw-onboarding__stage">
          <div className="aiw-onboarding__copy">
            <p className="aiw-onboarding__eyebrow">{t(act.eyebrow)}</p>
            <h2 id="aiw-onboarding-heading" tabIndex={-1}>{t(act.title)}</h2>
            <p>{t(act.body)}</p>
          </div>
          <div className="aiw-onboarding__preview" aria-hidden="true">
            <div className="aiw-onboarding__preview-icon"><ActIcon /></div>
            <strong>{t(act.title)}</strong>
            <div className="aiw-onboarding__preview-lines"><span /><span /><span /></div>
          </div>
        </div>

        <footer className="aiw-onboarding__actions">
          <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={retreat}>{t("aiw.onboarding.back")}</button>
          <span>{t("aiw.onboarding.keyboardHint")}</span>
          <button type="button" className="btn" onClick={advance}>{t(isLastStep ? "aiw.onboarding.start" : "aiw.onboarding.continue")}</button>
        </footer>
      </section>
    </PageFrame>
  );
}
