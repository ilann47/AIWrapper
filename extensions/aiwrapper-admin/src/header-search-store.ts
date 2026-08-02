/**
 * Header Search Store — directly adapted from 9router's Zustand store.
 * Pages register a placeholder, read the query and unregister on unmount.
 */
import { create } from "zustand";

interface HeaderSearchState {
  query: string;
  placeholder: string;
  visible: boolean;
  setQuery: (query: string) => void;
  register: (placeholder?: string) => void;
  unregister: () => void;
}

export const useHeaderSearchStore = create<HeaderSearchState>((set) => ({
  query: "",
  placeholder: "",
  visible: false,

  setQuery: (query) => set({ query }),

  register: (placeholder = "Search...") =>
    set({ visible: true, placeholder, query: "" }),

  unregister: () => set({ visible: false, placeholder: "", query: "" }),
}));
