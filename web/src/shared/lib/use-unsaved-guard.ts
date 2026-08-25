"use client";

import { useEffect } from "react";
import { useUnsavedGuardStore } from "./unsaved-guard-store";

/**
 * useUnsavedGuard — подключает экран к guard'у несохранённых изменений
 * (спека 0039, FR-13..FR-15): пока `isDirty` истинно, пишет `reason` в
 * `useUnsavedGuardStore` (читает `UnsavedGuardDialog`, перехват кликов по
 * ссылкам) и вешает `beforeunload` (закрытие/перезагрузка вкладки,
 * FR-14) — второй канал, независимый от кликов, поэтому вешается здесь же,
 * а не в диалоге.
 *
 * Снимает признак и обработчик, когда `isDirty` становится `false`
 * (сохранение/отмена уже отражены в величине, которую считает экран — см.
 * `tournament-screen.tsx`), и дополнительно на размонтирование экрана —
 * иначе уход с одного грязного экрана на другой через API роутера (не
 * клик, отдельный код) оставил бы чужой признак висеть в сторе.
 */
function beforeUnloadHandler(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = "";
}

export function useUnsavedGuard(isDirty: boolean, reason: string): void {
  const setDirty = useUnsavedGuardStore((s) => s.setDirty);

  useEffect(() => {
    if (!isDirty) {
      setDirty(null);
      return;
    }

    setDirty(reason);
    window.addEventListener("beforeunload", beforeUnloadHandler);

    return () => {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, reason]);

  useEffect(() => {
    return () => {
      setDirty(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
