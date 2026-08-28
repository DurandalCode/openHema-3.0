"use client";

import { useQuery } from "@tanstack/react-query";
import { listRosterRequest, type RosterListQuery } from "./requests";
import { fighterManagementKeys } from "./keys";

/**
 * useRoster — постраничная страница ростера турнира (бойцы + участия +
 * статусы) под текущий фильтр/поиск, admin (спека 0041, T20-T22).
 * Фильтр/поиск/постраничность выполняются на сервере — `query` целиком
 * входит в query key (смена любого поля key'а даёт отдельный кеш-слот и
 * запускает рефетч, отдельная инвалидация не нужна).
 *
 * `data.statusCounts` — счётчики по ВСЕМУ ростеру турнира, не зависят от
 * `query` (FR-4) — сервер считает их без фильтра при каждом ответе.
 *
 * refetchOnMount: "always" — боец чаще всего появляется через кроссдоменный
 * эффект регистрации заявки на другой странице (application-review), о
 * котором этот кеш ничего не знает и который некому инвалидировать. Без
 * этого при переходе на /admin/fighters клиентским роутером (без полной
 * перезагрузки) показывался устаревший список до истечения staleTime.
 */
export function useRoster(tournamentId: string, query: RosterListQuery) {
  return useQuery({
    queryKey: fighterManagementKeys.roster(tournamentId, query),
    queryFn: async () => {
      const res = await listRosterRequest(tournamentId, query);
      if (!res.ok) throw new Error(res.error);
      return { fighters: res.fighters, totalCount: res.totalCount, statusCounts: res.statusCounts };
    },
    enabled: tournamentId.length > 0,
    refetchOnMount: "always",
  });
}
