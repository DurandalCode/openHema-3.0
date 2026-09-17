"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Bracket } from "@/entities/bracket/lib/types";
import { seedSlotRequest } from "./requests";
import { bracketSeedingKeys } from "./keys";
import { bracketErrorMessage } from "./errors";
import { seedFighterInBracket } from "../lib/seed-fighter";

/**
 * useSeedSlot — мутация DnD: посадить бойца в слот первого круга (FR-7). Тот
 * же вызов используется и для перестановки уже посеянного бойца — сервер сам
 * решает обмен местами или отклоняет посадку в занятый слот (FR-8).
 *
 * Optimistic: только для перехода в пустой слот (частый случай — заполнение
 * сетки) — см. `seedFighterInBracket`. Занятый слот ждёт настоящего ответа
 * (обмен/отказ решает сервер), чтобы не рисовать состояние, которого сервер
 * может не подтвердить.
 */
export function useSeedSlot(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { fighterId: string; slot: number }) => {
      const res = await seedSlotRequest(stageId, vars.fighterId, vars.slot);
      if (!res.ok) throw new Error(bracketErrorMessage(res.error, res.status));
      return res.bracket;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: bracketSeedingKeys.bracket(stageId) });
      const prev = qc.getQueryData<Bracket>(bracketSeedingKeys.bracket(stageId));
      if (prev) {
        qc.setQueryData<Bracket>(bracketSeedingKeys.bracket(stageId), (cur) =>
          cur ? seedFighterInBracket(cur, vars.fighterId, vars.slot) : cur,
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(bracketSeedingKeys.bracket(stageId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: bracketSeedingKeys.bracket(stageId) });
    },
  });
}
