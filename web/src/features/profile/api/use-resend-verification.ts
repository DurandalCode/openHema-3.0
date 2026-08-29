"use client";

import { useMutation } from "@tanstack/react-query";
import { resendEmailVerificationRequest } from "./requests";

/**
 * useResendVerification — мутация повторной отправки письма подтверждения
 * (спека 0042, FR-4). Троттлинг (429) приходит как обычная ошибка —
 * `mutation.error.message` показывается тостом, отдельного локального
 * таймера в UI нет (сервер — единственный источник истины о троттлинге).
 */
export function useResendVerification() {
  return useMutation({
    mutationFn: async () => {
      const result = await resendEmailVerificationRequest();
      if (!result.ok) throw new Error(result.error);
    },
  });
}
