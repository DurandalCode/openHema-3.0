"use client";

import { useMutation } from "@tanstack/react-query";
import { loginRequest, type LoginInput } from "./requests";

/**
 * useLogin — мутация входа. `onSuccess` пробрасывается вызывающим
 * (close dialog + router.push + router.refresh). Бросает Error при `!ok`,
 * поэтому `mutation.error.message` доступен в UI, а `onSuccess` зовётся
 * только при реальном успехе.
 */
export function useLogin(onSuccess: () => void) {
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const result = await loginRequest(input);
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess,
  });
}
