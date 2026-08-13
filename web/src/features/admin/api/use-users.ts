"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsersRequest } from "./requests";
import { adminKeys } from "./keys";

/**
 * useUsers — единый список всех учётных записей (и админов, и обычных
 * пользователей) — единственный источник данных экрана `/admin` (FR-1,
 * план §«Обзор» п.1). Группировка по роли и счётчики считаются из этого же
 * массива в `features/admin/lib/select-users.ts`.
 */
export function useUsers() {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: async () => {
      const res = await listUsersRequest();
      if (!res.ok) throw new Error(res.error);
      return res.users;
    },
  });
}
