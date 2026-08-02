import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";

const testWindow = new Window({ url: "http://127.0.0.1:8765" });
Object.defineProperties(globalThis, {
  window: { configurable: true, value: testWindow },
  localStorage: { configurable: true, value: testWindow.localStorage },
});

const { selectHasCompleted, selectIsLastStep, selectStep, useOnboardingStore } =
  await import("../../../extensions/aiwrapper-onboarding/src/onboarding-store");

test("Traycer onboarding movement is bounded and completion is scoped by user", () => {
  useOnboardingStore.setState({ completedByUser: {}, step: 0 });
  useOnboardingStore.getState().retreat();
  expect(selectStep(useOnboardingStore.getState())).toBe(0);

  useOnboardingStore.getState().advance("ilan");
  expect(selectStep(useOnboardingStore.getState())).toBe(1);
  useOnboardingStore.setState({ step: 999 });
  expect(selectIsLastStep(useOnboardingStore.getState())).toBe(true);
  useOnboardingStore.getState().advance("ilan");

  expect(selectHasCompleted("ilan")(useOnboardingStore.getState())).toBe(true);
  expect(selectHasCompleted("other")(useOnboardingStore.getState())).toBe(false);
});

test("only per-user completion is persisted; the active step stays session-local", async () => {
  useOnboardingStore.setState({ completedByUser: {}, step: 2 });
  useOnboardingStore.getState().complete("ilan");
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const raw = testWindow.localStorage.getItem("aiwrapper-onboarding-v1");
  const persisted = JSON.parse(raw ?? "{}") as { state?: Record<string, unknown> };
  expect(Object.keys(persisted.state ?? {})).toEqual(["completedByUser"]);
  expect(persisted.state?.completedByUser).toMatchObject({ ilan: expect.any(Number) });
});

test("first authenticated access and replay page are wired into the OpenCodex shell", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const routing = readFileSync(new URL("../src/app-routing.ts", import.meta.url), "utf8");
  expect(app).toContain("!hasCompletedOnboarding");
  expect(app).toContain('navigateToPage("aiwrapper-onboarding")');
  expect(app).toContain("<OnboardingPage");
  expect(routing).toContain('"aiwrapper-onboarding"');
});
