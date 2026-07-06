"use client";

import { useQuery } from "@tanstack/react-query";
import { listAdminsRequest } from "./requests";
import { adminKeys } from "./keys";

/** useAdmins — список всех администраторов. */
export function useAdmins() {
  return useQuery({
    queryKey: adminKeys.admins,
    queryFn: async () => {
      const res = await listAdminsRequest();
      if (!res.ok) throw new Error(res.error);
      return res.users;
    },
  });
}
