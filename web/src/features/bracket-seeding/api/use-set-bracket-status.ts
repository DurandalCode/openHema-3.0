"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setStatusRequest } from "./requests";
import { bracketSeedingKeys } from "./keys";
import { bracketErrorMessage } from "./errors";

/**
 * useSetBracketStatus — мутация фиксации/расфиксации посева draft↔ready
 * (FR-10). Гейт «меньше двух посеянных» (FR-11) проверяет сервер
 * (`ErrNotEnoughSeeds`) — клиент не считает посев заранее, только показывает
 * ошибку мутации.
 */
export function useSetBracketStatus(stageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: "draft" | "ready") => {
      const res = await setStatusRequest(stageId, status);
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
      // Фиксация сетки материализует бои первого круга, расфиксация их
      // удаляет — как и у групп (use-set-layout-status.ts).
      qc.invalidateQueries({ queryKey: ["nomination-pools", "bouts"] });
    },
  });
}
