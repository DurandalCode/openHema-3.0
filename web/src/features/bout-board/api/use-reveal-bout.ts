"use client";

import { useMutation } from "@tanstack/react-query";
import { revealBoutRequest } from "./requests";

/**
 * useRevealBout — секретарь явно показывает текущий бой на всех
 * подключённых табло арены (спека 0015, UX-уточнение): развязывает
 * оглашение результата (`useFinishBout`, табло держит прошлый бой с
 * исходом) и переход к следующему бою на табло на разные действия панели.
 * Чисто отображенческий сигнал (не домен) — доску не меняет, поэтому
 * инвалидация `boutBoardKeys` не нужна: живой канал сам разошлёт табло
 * новый `room.revealGeneration`.
 */
export function useRevealBout(arenaId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await revealBoutRequest(arenaId);
      if (!res.ok) throw new Error(res.error);
    },
  });
}
