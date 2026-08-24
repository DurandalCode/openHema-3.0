"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsersRequest } from "./requests";
import { adminKeys } from "./keys";
import { UnauthorizedError } from "@/shared/api/unauthorized";

/**
 * useUsers — единый список всех учётных записей (и админов, и обычных
 * пользователей) — единственный источник данных экрана `/admin` (FR-1,
 * план §«Обзор» п.1). Группировка по роли и счётчики считаются из этого же
 * массива в `features/admin/lib/select-users.ts`.
 *
 * 401 бросает `UnauthorizedError`, а не обычный `Error` (спека 0038, FR-18):
 * до этого админка не участвовала в глобальном перехвате «сессия истекла» —
 * админ, чей access-токен протух, пока он сидел на `/admin`, видел сырой
 * текст ошибки сервера («authentication required») без пути к
 * восстановлению. Теперь `UnauthorizedError` ловит `QueryCache.onError`
 * (`shared/lib/query-client.ts`): один тихий `attemptSilentRefresh`, и
 * только если он не помог — глобальный диалог «Сессия истекла» (уже знает
 * `/admin` как защищённый маршрут, `shared/config/protected-routes.ts`).
 */
export function useUsers() {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: async () => {
      const res = await listUsersRequest();
      if (!res.ok) {
        if (res.status === 401) throw new UnauthorizedError(res.error);
        throw new Error(res.error);
      }
      return res.users;
    },
  });
}
