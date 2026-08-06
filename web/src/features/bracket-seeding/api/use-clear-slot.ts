"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Bracket } from "@/entities/bracket/lib/types";
import { clearSlotRequest } from "./requests";
import { bracketSeedingKeys } from "./keys";
import { clearSlotInBracket } from "../lib/seed-fighter";

/**
 * useClearSlot — мутация освобождения слота (FR-8): по кнопке очистки либо
 * DnD в нераспределённые. Optimistic — по образцу `useUnassignFighter`
 * (`features/nomination-pools`), чтобы карточка не «улетала обратно» при DnD.
 */
export function useClearSlot(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slot: number) => {
      const res = await clearSlotRequest(stageId, slot);
      if (!res.ok) throw new Error(res.error);
      return res.bracket;
    },
    onMutate: async (slot) => {
      await qc.cancelQueries({ queryKey: bracketSeedingKeys.bracket(stageId) });
      const prev = qc.getQueryData<Bracket>(bracketSeedingKeys.bracket(stageId));
      if (prev) {
        qc.setQueryData<Bracket>(bracketSeedingKeys.bracket(stageId), (cur) =>
          cur ? clearSlotInBracket(cur, slot) : cur,
        );
      }
      return { prev };
    },
    onError: (_err, _slot, ctx) => {
      if (ctx?.prev) qc.setQueryData(bracketSeedingKeys.bracket(stageId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: bracketSeedingKeys.bracket(stageId) });
    },
  });
}
