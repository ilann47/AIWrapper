import type { TKey } from "../../../apps/opencodex-gui/src/i18n/shared";
import type { Page } from "../../../apps/opencodex-gui/src/app-routing";

export type OnboardingActId = "chat" | "conversations" | "usage" | "connections";

export interface OnboardingAct {
  readonly id: OnboardingActId;
  readonly eyebrow: TKey;
  readonly title: TKey;
  readonly body: TKey;
  readonly destination: Page;
}

/** Adapted from Traycer's act-based onboarding sequence for AIWrapper's product flow. */
export const ONBOARDING_ACTS: ReadonlyArray<OnboardingAct> = [
  {
    id: "chat",
    eyebrow: "aiw.onboarding.chatEyebrow",
    title: "aiw.onboarding.chatTitle",
    body: "aiw.onboarding.chatBody",
    destination: "aiwrapper-chat",
  },
  {
    id: "conversations",
    eyebrow: "aiw.onboarding.conversationsEyebrow",
    title: "aiw.onboarding.conversationsTitle",
    body: "aiw.onboarding.conversationsBody",
    destination: "aiwrapper-sessions",
  },
  {
    id: "usage",
    eyebrow: "aiw.onboarding.usageEyebrow",
    title: "aiw.onboarding.usageTitle",
    body: "aiw.onboarding.usageBody",
    destination: "aiwrapper-billing",
  },
  {
    id: "connections",
    eyebrow: "aiw.onboarding.connectionsEyebrow",
    title: "aiw.onboarding.connectionsTitle",
    body: "aiw.onboarding.connectionsBody",
    destination: "aiwrapper-connections",
  },
];
