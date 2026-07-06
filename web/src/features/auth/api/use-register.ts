"use client";

import { useMutation } from "@tanstack/react-query";
import { registerRequest, type RegisterInput } from "./requests";

/**
 * useRegister — мутация регистрации. `onSuccess` пробрасывается вызывающим
 * (close dialog + router.push + router.refresh). Бросает Error при `!ok`,
 * поэтому `mutation.error.message` доступен в UI, а `onSuccess` зовётся
 * только при реальном успехе.
 */
export function useRegister(onSuccess: () => void) {
  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      const result = await registerRequest(input);
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess,
  });
}
