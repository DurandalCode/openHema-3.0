"use client";

import { useQuery } from "@tanstack/react-query";
import { listMyApplicationsRequest } from "./requests";
import { myApplicationsKeys } from "./keys";
import { UnauthorizedError } from "@/shared/api/unauthorized";

/**
 * useMyApplications — заявки текущего пользователя (кабинет). `enabled`
 * (по умолчанию `true`) — гейт запроса для мест, где сессии может не быть
 * (спека 0036, CTA на публичной странице номинации): гость получил бы
 * гарантированный 401 без гейта, `enabled: false` не даёт запросу уйти.
 *
 * 401 (сессия умерла посреди работы с кабинетом, спека 0038 FR-18) бросает
 * `UnauthorizedError`, а не обычный `Error` — её ловит глобальный
 * `QueryCache.onError` (`shared/lib/query-client.ts`) и поднимает «Сессия
 * истекла» вместо тихого пустого списка/общей ошибки.
 */
export function useMyApplications(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: myApplicationsKeys.list(),
    queryFn: async () => {
      const res = await listMyApplicationsRequest();
      if (!res.ok) {
        if (res.status === 401) throw new UnauthorizedError(res.error);
        throw new Error(res.error);
      }
      return res.applications;
    },
    enabled: options?.enabled ?? true,
  });
}
