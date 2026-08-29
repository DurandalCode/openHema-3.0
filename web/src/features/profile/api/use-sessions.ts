"use client";

import { useQuery } from "@tanstack/react-query";
import { listSessionsRequest } from "./requests";
import { profileKeys } from "./keys";

/**
 * useSessions — список активных refresh-сессий текущего пользователя
 * (спека 0042, FR-11). 401 бросает `UnauthorizedError` уже внутри
 * `apiFetch`/`listSessionsRequest` — ловится глобальным `QueryCache.onError`
 * (`shared/lib/query-client.ts`), диалог «Сессия истекла» подхватывает как
 * везде.
 */
export function useSessions() {
  return useQuery({
    queryKey: profileKeys.sessions,
    queryFn: async () => {
      const res = await listSessionsRequest();
      if (!res.ok) throw new Error(res.error);
      return res.sessions;
    },
  });
}
