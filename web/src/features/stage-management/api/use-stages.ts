"use client";

import { useQuery } from "@tanstack/react-query";
import { listStagesRequest } from "./requests";
import { stageManagementKeys } from "./keys";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";

/**
 * useStages — список этапов номинации + диагностика схемы для клиентских
 * компонентов админки (FR-18; спека 0020, FR-8 — `issues` приезжает вместе
 * со списком, отдельного запроса нет). `initialData` (спека 0032, join) —
 * список, уже загруженный server component'ом страницы этапа (`getStages`,
 * `page.tsx`): первый рендер без скелетона, по образцу `use-nomination.ts`
 * (0031). Необязателен — `nomination-schema-screen.tsx` продолжает звать
 * без него.
 */
export function useStages(
  nominationId: string,
  initialData?: { stages: Stage[]; issues: SchemaIssue[] },
) {
  return useQuery({
    queryKey: stageManagementKeys.list(nominationId),
    queryFn: async () => {
      const res = await listStagesRequest(nominationId);
      if (!res.ok) throw new Error(res.error);
      return { stages: res.stages, issues: res.issues };
    },
    initialData,
    enabled: nominationId.length > 0,
  });
}
