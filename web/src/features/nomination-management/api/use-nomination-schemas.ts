"use client";

import { useQueries } from "@tanstack/react-query";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";
import { nominationManagementKeys } from "./keys";
import { listNominationStagesRequest } from "./requests";

export type NominationSchema = {
  stages: Stage[];
  issues: SchemaIssue[];
  isError: boolean;
};

/**
 * useNominationSchemas — схема этапов + диагностика для списка номинаций
 * (спека 0028, FR-5/FR-6): один запрос этапов на номинацию (NFR-2), без
 * агрегирующей ручки. В отличие от живого статуса площадок (0027) — без
 * `refetchInterval`: схема холодная, обновляется мутациями, не таймером
 * (spec NFR-2). Ошибка одной номинации не роняет остальные (`retry: false`,
 * FR-6) — вызывающий код читает `isError` и показывает «схема недоступна»
 * только в её строке.
 */
export function useNominationSchemas(nominationIds: string[]): Map<string, NominationSchema> {
  const results = useQueries({
    queries: nominationIds.map((id) => ({
      queryKey: nominationManagementKeys.stages(id),
      queryFn: () => listNominationStagesRequest(id),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const map = new Map<string, NominationSchema>();
  nominationIds.forEach((id, i) => {
    const result = results[i]?.data;
    if (result?.ok) {
      map.set(id, { stages: result.stages, issues: result.issues, isError: false });
    } else {
      map.set(id, { stages: [], issues: [], isError: Boolean(results[i]?.isError) });
    }
  });
  return map;
}
