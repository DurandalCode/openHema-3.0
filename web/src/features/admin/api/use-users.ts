"use client";

import { useQuery } from "@tanstack/react-query";
import { listUsersRequest } from "./requests";
import { adminKeys } from "./keys";

/** useUsers — список всех пользователей. */
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
