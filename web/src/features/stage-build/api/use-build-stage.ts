"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TieResolution } from "@/entities/stage/lib/types";
import { bracketSeedingKeys } from "@/features/bracket-seeding/api/keys";
import { nominationPoolsKeys } from "@/features/nomination-pools/api/keys";
import { stageManagementKeys } from "@/features/stage-management/api/keys";
import { buildStageRequest } from "./requests";

/**
 * useBuildStage — мутация формирования этапа (0019, FR-13/FR-16): заполняет
 * состав целевого этапа из превью (`use-build-preview.ts`) + уже собранных
 * `ties` (`lib/tie-resolution.ts`). Формирование — те же посадки бойцов в
 * контейнеры, что и ручной путь (FR-29), поэтому инвалидирует ровно то, что
 * меняет обычный посев/раскладка: список этапов номинации (статус/состав в
 * карточке этапа), групповую раскладку целевого этапа
 * (`nomination-pools/api/keys.ts`) и сетку целевого этапа
 * (`bracket-seeding/api/keys.ts`) — используется только одна из двух в
 * зависимости от типа целевого этапа, вторая инвалидация просто не находит
 * активного наблюдателя.
 */
export function useBuildStage(stageId: string, nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ties: TieResolution[]) => {
      const res = await buildStageRequest(stageId, ties);
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stageManagementKeys.list(nominationId) });
      qc.invalidateQueries({ queryKey: nominationPoolsKeys.layout(stageId) });
      qc.invalidateQueries({ queryKey: bracketSeedingKeys.bracket(stageId) });
    },
  });
}
