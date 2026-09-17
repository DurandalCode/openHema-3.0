"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { undoBracketRequest } from "./requests";
import { bracketSeedingKeys } from "./keys";
import { bracketErrorMessage } from "./errors";

/** useUndoBracket — мутация «Отменить»: откат последнего действия посева (FR-8). */
export function useUndoBracket(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await undoBracketRequest(stageId);
      if (!res.ok) throw new Error(bracketErrorMessage(res.error, res.status));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bracketSeedingKeys.bracket(stageId) });
      // Список этапов адресован nominationId, которого здесь нет
      // (FSD-запрет на импорт чужой фичи оставляет только ключ-префикс) —
      // инвалидируем по префиксу, как use-set-layout-status делает для
      // боёв. Без этого шапка страницы этапа и карточка на схеме читают
      // stage.status из протухшего useStages (staleTime 60s) и до минуты
      // показывают состав/статус, которого уже нет.
      qc.invalidateQueries({ queryKey: ["stage-management", "list"] });
    },
  });
}
