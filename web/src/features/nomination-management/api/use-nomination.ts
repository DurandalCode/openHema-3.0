"use client";

import { useQuery } from "@tanstack/react-query";
import type { Nomination } from "@/entities/nomination/lib/types";
import { getNominationRequest } from "./requests";
import { nominationManagementKeys } from "./keys";

/**
 * useNomination — одна номинация для инлайн-правки шапки экрана схемы
 * (спека 0031, FR-2). `initialData` — номинация, уже загруженная server
 * component'ом страницы (`getNomination`, SSR): экран не мигает скелетоном
 * на маунте, а после успешной мутации (`use-update-nomination.ts`
 * инвалидирует `nominationManagementKeys.one`) хук перезапрашивает свежее
 * значение.
 */
export function useNomination(id: string, initialData?: Nomination) {
  return useQuery({
    queryKey: nominationManagementKeys.one(id),
    queryFn: async () => {
      const res = await getNominationRequest(id);
      if (!res.ok) throw new Error(res.error);
      return res.nomination;
    },
    initialData,
    enabled: id.length > 0,
  });
}
