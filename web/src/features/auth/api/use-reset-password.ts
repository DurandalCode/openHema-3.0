"use client";

import { useMutation } from "@tanstack/react-query";
import { resetPassword, type ResetPasswordInput } from "./requests";

/**
 * useResetPassword — мутация установки нового пароля по ссылке (spec 0037
 * FR-7/FR-8, spec 0038 FR-10..FR-12). Бросает Error при `!ok`, чтобы
 * `mutation.error.message` (единый текст «ссылка недействительна или
 * устарела» либо ошибка сети) был доступен в UI.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (input: ResetPasswordInput) => {
      const result = await resetPassword(input);
      if (!result.ok) throw new Error(result.error);
    },
  });
}
