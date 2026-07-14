"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PoolLayout } from "@/entities/pool/lib/types";
import { unassignFighterRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";
import { moveFighterInLayout } from "./move-fighter";

/**
 * useUnassignFighter — мутация DnD: вернуть бойца из пула в
 * нераспределённые (FR-5). Только draft.
 *
 * Optimistic: см. useAssignFighter (fix dnd-kit drop-back в исходную колонку).
 */
export function useUnassignFighter(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fighterId: string) => {
      const res = await unassignFighterRequest(nominationId, fighterId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onMutate: async (fighterId) => {
      await qc.cancelQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
      const prev = qc.getQueryData<PoolLayout>(nominationPoolsKeys.layout(nominationId));
      if (prev) {
        qc.setQueryData<PoolLayout>(nominationPoolsKeys.layout(nominationId), (cur) =>
          cur ? moveFighterInLayout(cur, fighterId, null) : cur,
        );
      }
      return { prev };
    },
    onError: (_err, _fighterId, ctx) => {
      if (ctx?.prev) qc.setQueryData(nominationPoolsKeys.layout(nominationId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
    },
  });
}
