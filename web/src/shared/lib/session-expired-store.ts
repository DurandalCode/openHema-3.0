import { create } from "zustand";

/**
 * SessionExpiredReason — откуда поднят диалог «Сессия истекла» (спека 0038,
 * FR-15): `cookie` — метка `hema_session_expired`, оставленная middleware
 * после неудачного продления; `query` — `UnauthorizedError` из клиентского
 * запроса (см. `shared/api/unauthorized.ts`), пойманного глобальным
 * `QueryCache.onError`.
 */
export type SessionExpiredReason = "cookie" | "query";

type SessionExpiredState = {
  isOpen: boolean;
  reason: SessionExpiredReason | null;
  open: (reason: SessionExpiredReason) => void;
  close: () => void;
};

/** useSessionExpiredStore — UI-state диалога истёкшей сессии (ADR 0006). */
export const useSessionExpiredStore = create<SessionExpiredState>((set) => ({
  isOpen: false,
  reason: null,
  open: (reason) => set({ isOpen: true, reason }),
  close: () => set({ isOpen: false, reason: null }),
}));
