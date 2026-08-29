"use client";

import { useMutation } from "@tanstack/react-query";
import { requestEmailChangeRequest } from "./requests";

/**
 * useRequestEmailChange — мутация запроса смены адреса учётки (спека
 * 0042, FR-6). Бросает Error при `!ok` (неверный пароль, занятый адрес),
 * чтобы `mutation.error.message` был доступен диалогу.
 */
export function useRequestEmailChange() {
  return useMutation({
    mutationFn: async (input: { newEmail: string; currentPassword: string }) => {
      const result = await requestEmailChangeRequest(input.newEmail, input.currentPassword);
      if (!result.ok) throw new Error(result.error);
      return result.user;
    },
  });
}
