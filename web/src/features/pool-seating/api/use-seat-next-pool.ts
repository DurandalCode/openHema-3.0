"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applyArenaState, unwrapArenaState } from "./arena-state-cache";
import { seatNextPoolRequest } from "./requests";

/**
 * useSeatNextPool — мутация «Поставить следующий» (спека 0063, FR-9):
 * ставит первый пул очереди на свободную арену. Единственный переход
 * очереди — автоматики нет (FR-8).
 */
export function useSeatNextPool(arenaId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrapArenaState(await seatNextPoolRequest(arenaId)),
    onSuccess: (state) => applyArenaState(qc, arenaId, state),
  });
}
