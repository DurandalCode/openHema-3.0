"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { undoBracketRequest } from "./requests";
import { bracketSeedingKeys } from "./keys";

/** useUndoBracket — мутация «Отменить»: откат последнего действия посева (FR-8). */
export function useUndoBracket(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await undoBracketRequest(stageId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bracketSeedingKeys.bracket(stageId) });
    },
  });
}
