import { create } from "zustand";
import type { AuthMode } from "../api/requests";

type AuthDialogState = {
  isOpen: boolean;
  mode: AuthMode;
  open: (mode: AuthMode) => void;
  close: () => void;
  setMode: (mode: AuthMode) => void;
};

/**
 * useAuthDialogStore — UI-state AuthDialog модалки (см. ADR 0006).
 * Zustand store без провайдера; доступен из любого client-компонента.
 * Только client UI state — никакого server data.
 */
export const useAuthDialogStore = create<AuthDialogState>((set) => ({
  isOpen: false,
  mode: "login",
  open: (mode) => set({ isOpen: true, mode }),
  close: () => set({ isOpen: false }),
  setMode: (mode) => set({ mode }),
}));
