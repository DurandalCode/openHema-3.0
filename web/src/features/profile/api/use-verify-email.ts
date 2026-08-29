"use client";

import { useMutation } from "@tanstack/react-query";
import { verifyEmailRequest } from "./requests";

/**
 * useVerifyEmail — мутация подтверждения адреса по ссылке из письма
 * (спека 0042, FR-3). Бросает Error при `!ok`, чтобы `mutation.error`
 * (или сам факт ошибки) позволял вызывающему экрану переключиться в
 * состояние «ссылка недействительна».
 */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (token: string) => {
      const result = await verifyEmailRequest(token);
      if (!result.ok) throw new Error(result.error);
    },
  });
}
