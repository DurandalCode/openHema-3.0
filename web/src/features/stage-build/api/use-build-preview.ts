"use client";

import { useMutation } from "@tanstack/react-query";
import { previewStageBuildRequest } from "./requests";
import type { TieResolution } from "@/entities/stage/lib/types";

/**
 * useBuildPreview — превью формирования этапа (0019, FR-15): `useMutation`,
 * не `useQuery` — результат не идентифицируется одним `stageId` в кэше, а
 * зависит от текущего набора `ties` на каждый вызов (цикл «превью → есть
 * дележ → ответ организатора → превью снова», `lib/tie-resolution.ts`);
 * семантически это действие «пересчитать превью с этими ответами», а не
 * «прочитать» — тот же выбор, что и `bracket-seeding/api/use-seed-slot.ts`
 * для действий, зависящих от пользовательского ввода. Без побочных эффектов
 * на сервере — никакой инвалидации кэша здесь не нужно.
 */
export function useBuildPreview(stageId: string) {
  return useMutation({
    mutationFn: async (ties: TieResolution[]) => {
      const res = await previewStageBuildRequest(stageId, ties);
      if (!res.ok) throw new Error(res.error);
      return res.preview;
    },
  });
}
