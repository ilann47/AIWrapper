import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ONBOARDING_ACTS } from "./onboarding-acts";

const LAST_STEP = ONBOARDING_ACTS.length - 1;
const clampStep = (step: number): number =>
  Math.min(Math.max(Math.trunc(step), 0), LAST_STEP);

/**
 * Adapted from Traycer's first-launch onboarding store. Completion is scoped
 * per AIWrapper user because several individual keys can use the same browser.
 * The active step intentionally remains session-local.
 */
interface OnboardingState {
  readonly completedByUser: Readonly<Record<string, number>>;
  readonly step: number;
  readonly advance: (userId: string) => void;
  readonly retreat: () => void;
  readonly complete: (userId: string) => void;
  readonly restart: () => void;
  readonly reset: (userId: string) => void;
}

export const selectStep = (state: OnboardingState): number => clampStep(state.step);

export const selectIsLastStep = (state: OnboardingState): boolean =>
  selectStep(state) >= LAST_STEP;

export const selectHasCompleted = (userId: string | undefined) =>
  (state: OnboardingState): boolean => Boolean(userId && state.completedByUser[userId]);

function persistedCompletions(persistedState: unknown): Readonly<Record<string, number>> {
  if (typeof persistedState !== "object" || persistedState === null) return {};
  if (!("completedByUser" in persistedState)) return {};
  const value = persistedState.completedByUser;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] =>
      entry[0].length > 0 && typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      completedByUser: {},
      step: 0,
      advance: (userId) => {
        const step = clampStep(get().step);
        if (step >= LAST_STEP) {
          set((state) => ({ completedByUser: { ...state.completedByUser, [userId]: Date.now() } }));
          return;
        }
        set({ step: step + 1 });
      },
      retreat: () => set({ step: clampStep(get().step - 1) }),
      complete: (userId) => set((state) => ({
        completedByUser: { ...state.completedByUser, [userId]: Date.now() },
      })),
      restart: () => set({ step: 0 }),
      reset: (userId) => set((state) => {
        const completedByUser = { ...state.completedByUser };
        delete completedByUser[userId];
        return { completedByUser, step: 0 };
      }),
    }),
    {
      name: "aiwrapper-onboarding-v1",
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => ({
        ...currentState,
        completedByUser: persistedCompletions(persistedState),
        step: 0,
      }),
      partialize: (state) => ({ completedByUser: state.completedByUser }),
    },
  ),
);
