"use client";

import { useMutation } from "@tanstack/react-query";
import { cancelEmailChangeRequest } from "./requests";

/**
 * useCancelEmailChange — мутация отмены незавершённого запроса смены
 * адреса (спека 0042, FR-6).
 */
export function useCancelEmailChange() {
  return useMutation({
    mutationFn: async () => {
      const result = await cancelEmailChangeRequest();
      if (!result.ok) throw new Error(result.error);
      return result.user;
    },
  });
}
