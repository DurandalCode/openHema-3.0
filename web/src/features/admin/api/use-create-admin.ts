"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createAdminRequest, type CreateAdminInput } from "./requests";
import { adminKeys } from "./keys";

/**
 * useCreateAdmin — мутация создания админа. При успехе инвалидирует списки
 * админов и пользователей.
 */
export function useCreateAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAdminInput) => {
      const res = await createAdminRequest(input);
      if (!res.ok) throw new Error(res.error);
      return res.user;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.admins });
      qc.invalidateQueries({ queryKey: adminKeys.users });
    },
  });
}
