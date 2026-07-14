"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unassignFighterRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/**
 * useUnassignFighter — мутация DnD: вернуть бойца из пула в
 * нераспределённые (FR-5). Только draft.
 */
export function useUnassignFighter(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fighterId: string) => {
      const res = await unassignFighterRequest(nominationId, fighterId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
    },
  });
}
