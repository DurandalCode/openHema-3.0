"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { demoteUserRequest } from "./requests";
import { adminKeys } from "./keys";

/** useDemoteUser — мутация понижения админа до user. */
export function useDemoteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await demoteUserRequest(userId);
      if (!res.ok) throw new Error(res.error);
      return res.user;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.admins });
      qc.invalidateQueries({ queryKey: adminKeys.users });
    },
  });
}
