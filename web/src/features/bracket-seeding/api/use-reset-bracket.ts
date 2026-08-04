"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resetBracketRequest } from "./requests";
import { bracketSeedingKeys } from "./keys";

/** useResetBracket — мутация сброса посева целиком (undoable, FR-8). */
export function useResetBracket(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await resetBracketRequest(stageId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bracketSeedingKeys.bracket(stageId) });
    },
  });
}
