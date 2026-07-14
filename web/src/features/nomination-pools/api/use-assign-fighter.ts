"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { assignFighterRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/**
 * useAssignFighter — мутация DnD: положить бойца в пул (из нераспределённых
 * либо из другого пула — move одним действием, FR-5). Только draft.
 */
export function useAssignFighter(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { fighterId: string; poolId: string }) => {
      const res = await assignFighterRequest(nominationId, vars.fighterId, vars.poolId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
    },
  });
}
