"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { promoteUserRequest } from "./requests";
import { adminKeys } from "./keys";

/** usePromoteUser — мутация повышения пользователя до admin. */
export function usePromoteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await promoteUserRequest(userId);
      if (!res.ok) throw new Error(res.error);
      return res.user;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.admins });
      qc.invalidateQueries({ queryKey: adminKeys.users });
    },
  });
}
