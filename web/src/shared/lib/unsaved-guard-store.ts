import { create } from "zustand";

type UnsavedGuardState = {
  /**
   * dirtyReason — что именно не сохранено (спека 0039, FR-13..FR-16),
   * человекочитаемая подпись экрана/сущности («профиль турнира», «этап
   * «Плейофф»»), подставляется в текст диалога `UnsavedGuardDialog`.
   * `null` — экран чист, guard не вмешивается.
   */
  dirtyReason: string | null;
  /**
   * pendingHref — куда пользователь пытался уйти, пока экран был грязным;
   * заполняется `request()` (перехват клика по ссылке), используется
   * `UnsavedGuardDialog` для `router.push` после подтверждения.
   */
  pendingHref: string | null;
  setDirty: (reason: string | null) => void;
  request: (href: string) => void;
  confirm: () => void;
  cancel: () => void;
};

/**
 * useUnsavedGuardStore — UI-state guard'а несохранённых изменений (спека
 * 0039, блок C, ADR 0006). По образцу `session-expired-store`: экраны с
 * копящимся вводом (`useUnsavedGuard`) пишут признак сюда, а
 * `UnsavedGuardDialog` (перехват кликов + `beforeunload`, монтируется один
 * раз в `app/layout.tsx`) его читает — единая точка встречи между
 * произвольным экраном и общим диалогом.
 */
export const useUnsavedGuardStore = create<UnsavedGuardState>((set) => ({
  dirtyReason: null,
  pendingHref: null,
  setDirty: (reason) => set({ dirtyReason: reason }),
  request: (href) => set({ pendingHref: href }),
  confirm: () => set({ dirtyReason: null, pendingHref: null }),
  cancel: () => set({ pendingHref: null }),
}));
