"use client";

import { useQuery } from "@tanstack/react-query";
import { listMyApplicationsRequest } from "./requests";
import { myApplicationsKeys } from "./keys";

/** useMyApplications — заявки текущего пользователя (кабинет). */
export function useMyApplications() {
  return useQuery({
    queryKey: myApplicationsKeys.list(),
    queryFn: async () => {
      const res = await listMyApplicationsRequest();
      if (!res.ok) throw new Error(res.error);
      return res.applications;
    },
  });
}
