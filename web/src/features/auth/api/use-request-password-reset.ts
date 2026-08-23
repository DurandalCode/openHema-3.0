"use client";

import { useMutation } from "@tanstack/react-query";
import { requestPasswordReset } from "./requests";

/**
 * useRequestPasswordReset — мутация запроса ссылки восстановления (spec
 * 0037 FR-1/FR-2, spec 0038 FR-8). Бросает Error при `!ok`, чтобы
 * `mutation.error.message` был доступен в UI — на практике сервер всегда
 * возвращает `{ok:true}`, ошибка возможна только на уровне BFF-транспорта.
 */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (email: string) => {
      const result = await requestPasswordReset(email);
      if (!result.ok) throw new Error(result.error);
    },
  });
}
