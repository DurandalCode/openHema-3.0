"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PoolLayout } from "@/entities/pool/lib/types";
import { assignFighterRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";
import { moveFighterInLayout } from "./move-fighter";

/**
 * useAssignFighter — мутация DnD: положить бойца в пул (из нераспределённых
 * либо из другого пула — move одним действием, FR-5). Только draft.
 *
 * Optimistic: на `onMutate` боец мгновенно перемещается в целевой пул в кэше,
 * чтобы визуально карточка «оставалась» в целевой колонке на дропе, а не
 * улетала обратно к исходнику перед приходом ответа (fix dnd-kit drop-back).
 */
export function useAssignFighter(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { fighterId: string; poolId: string }) => {
      const res = await assignFighterRequest(nominationId, vars.fighterId, vars.poolId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
      const prev = qc.getQueryData<PoolLayout>(nominationPoolsKeys.layout(nominationId));
      if (prev) {
        qc.setQueryData<PoolLayout>(nominationPoolsKeys.layout(nominationId), (cur) =>
          cur ? moveFighterInLayout(cur, vars.fighterId, vars.poolId) : cur,
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(nominationPoolsKeys.layout(nominationId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
    },
  });
}
