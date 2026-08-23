"use client";

import { useMutation } from "@tanstack/react-query";
import { changePasswordRequest, type ChangePasswordInput } from "./requests";

/**
 * useChangePassword — мутация смены пароля изнутри кабинета (спека 0038,
 * FR-24). Бросает Error при `!ok` (неверный текущий пароль и т.п.).
 * `UnauthorizedError` (401) пробрасывается как есть — см. `useUpdateProfile`.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: ChangePasswordInput) => {
      const result = await changePasswordRequest(input);
      if (!result.ok) throw new Error(result.error);
    },
  });
}
