"use client";

import { useMutation } from "@tanstack/react-query";
import { confirmEmailChangeRequest } from "./requests";

/**
 * useConfirmEmailChange — мутация подтверждения смены адреса по ссылке из
 * письма, отправленного на новый адрес (спека 0042, FR-6). Используется
 * публичной страницей `/email-change/confirm` — сервер не различает
 * причину отказа (просрочена/погашена/адрес уже занят), поэтому вызывающий
 * экран трактует любую ошибку как единый «недействительно» (NFR-2).
 */
export function useConfirmEmailChange() {
  return useMutation({
    mutationFn: async (token: string) => {
      const result = await confirmEmailChangeRequest(token);
      if (!result.ok) throw new Error(result.error);
      return result.user;
    },
  });
}
