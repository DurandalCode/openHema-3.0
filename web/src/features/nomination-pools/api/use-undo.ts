"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { undoRequest } from "./requests";
import { nominationPoolsKeys } from "./keys";

/**
 * useUndo — мутация «Отменить»: откат последнего mutating-действия
 * (автораспределение или удаление пула, FR-7a). Только draft.
 */
export function useUndo(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await undoRequest(nominationId);
      if (!res.ok) throw new Error(res.error);
      return res.layout;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(nominationId) });
    },
  });
}
