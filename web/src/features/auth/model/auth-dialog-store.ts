import { create } from "zustand";
import type { AuthMode } from "../api/requests";

type AuthDialogState = {
  isOpen: boolean;
  mode: AuthMode;
  /**
   * Страница, на которую нужно вернуться после успешного входа (FR-16).
   * Заводится здесь для трека сессии (0038, волна 2) — сам возврат ещё не
   * подключён.
   */
  returnTo?: string;
  open: (mode: AuthMode, returnTo?: string) => void;
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
  returnTo: undefined,
  open: (mode, returnTo) => set({ isOpen: true, mode, returnTo }),
  close: () => set({ isOpen: false }),
  setMode: (mode) => set({ mode }),
}));
