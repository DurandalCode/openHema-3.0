"use client";

import { useQuery } from "@tanstack/react-query";
import { listArenasRequest } from "./requests";
import { arenaManagementKeys } from "./keys";
import { UnauthorizedError } from "@/shared/api/unauthorized";

/**
 * useArenas — площадки турнира для клиентских компонентов админки.
 *
 * 401 бросает `UnauthorizedError` (спека 0038, FR-18) — та же причина, что
 * `features/admin/api/use-users.ts`: без этого админ, чей access-токен
 * протух, пока он сидел на `/admin/arenas`, видел сырой текст ошибки
 * сервера без пути к восстановлению вместо тихого продления/диалога
 * «Сессия истекла».
 */
export function useArenas(tournamentId: string) {
  return useQuery({
    queryKey: arenaManagementKeys.list(tournamentId),
    queryFn: async () => {
      const res = await listArenasRequest(tournamentId);
      if (!res.ok) {
        if (res.status === 401) throw new UnauthorizedError(res.error);
        throw new Error(res.error);
      }
      return res.arenas;
    },
    enabled: tournamentId.length > 0,
  });
}