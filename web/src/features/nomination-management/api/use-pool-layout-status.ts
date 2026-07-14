"use client";

import { useQuery } from "@tanstack/react-query";
import { getPoolLayoutStatusRequest } from "./requests";
import { nominationManagementKeys } from "./keys";

/**
 * usePoolLayoutStatus — статус раскладки бойцов по пулам для одной номинации
 * (draft/ready/...). Используется в списке номинаций (бейдж статуса).
 * `staleTime: 30_000` — статусы меняются редко, не дёргаем сервер на каждый
 * ререндер списка.
 */
export function usePoolLayoutStatus(nominationId: string) {
  return useQuery({
    queryKey: nominationManagementKeys.poolLayoutStatus(nominationId),
    queryFn: async () => {
      const res = await getPoolLayoutStatusRequest(nominationId);
      if (!res.ok) throw new Error(res.error);
      return res.status;
    },
    enabled: nominationId.length > 0,
    staleTime: 30_000,
  });
}