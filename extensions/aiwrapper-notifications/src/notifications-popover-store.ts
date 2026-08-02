import { create } from "zustand";
import {
  ALL_NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from "./notification-category";

interface NotificationsPopoverState {
  readonly open: boolean;
  readonly originUnavailable: boolean;
  readonly originUnavailableHostLabel: string | null;
  /** Recent-only open-session filters. Reset to defaults on every open and
   * never applied to Attention. */
  readonly unreadOnly: boolean;
  readonly categories: ReadonlySet<NotificationCategory>;
  readonly setOpen: (next: boolean) => void;
  readonly openWithOriginUnavailable: (hostLabel: string | null) => void;
  readonly setUnreadOnly: (next: boolean) => void;
  readonly toggleCategory: (category: NotificationCategory) => void;
  readonly resetFilters: () => void;
}

export const useNotificationsPopoverStore = create<NotificationsPopoverState>(
  (set) => ({
    open: false,
    originUnavailable: false,
    originUnavailableHostLabel: null,
    unreadOnly: false,
    categories: ALL_NOTIFICATION_CATEGORIES,
    setOpen: (next) => {
      set(
        next
          ? {
              open: next,
              unreadOnly: false,
              categories: ALL_NOTIFICATION_CATEGORIES,
              originUnavailable: false,
              originUnavailableHostLabel: null,
            }
          : {
              open: next,
              originUnavailable: false,
              originUnavailableHostLabel: null,
            },
      );
    },
    openWithOriginUnavailable: (hostLabel) => {
      set({
        open: true,
        unreadOnly: false,
        categories: ALL_NOTIFICATION_CATEGORIES,
        originUnavailable: true,
        originUnavailableHostLabel: hostLabel,
      });
    },
    setUnreadOnly: (next) => {
      set({ unreadOnly: next });
    },
    toggleCategory: (category) => {
      set((state) => {
        const next = new Set(state.categories);
        if (next.has(category)) {
          next.delete(category);
        } else {
          next.add(category);
        }
        return { categories: next };
      });
    },
    resetFilters: () => {
      set({ unreadOnly: false, categories: ALL_NOTIFICATION_CATEGORIES });
    },
  }),
);
