"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitApplicationRequest, type SubmitApplicationDetails } from "./requests";
import { myApplicationsKeys } from "./keys";
import { ApplicationRequestError } from "./mutation-error";
import { UnauthorizedError } from "@/shared/api/unauthorized";

/**
 * useSubmitApplication — мутация подачи заявки в номинацию (клуб и признак
 * экипировки — опциональные доп. поля, спека 0006). При успехе инвалидирует
 * «мои заявки» (кабинет перечитает список при следующем заходе).
 */
export function useSubmitApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      nominationId,
      ...details
    }: { nominationId: string } & SubmitApplicationDetails) => {
      const res = await submitApplicationRequest(nominationId, details);
      if (!res.ok) {
        // 401 — сессия умерла посреди заполнения формы (спека 0038, FR-18/
        // AC-10): UnauthorizedError ловит глобальный MutationCache.onError
        // и поднимает «Сессия истекла» вместо тоста с общим текстом ошибки
        // (черновик формы уже сохранён — features/my-applications/model/apply-draft.ts).
        if (res.status === 401) throw new UnauthorizedError(res.error);
        throw new ApplicationRequestError(res.error, res.status);
      }
      return res.application;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: myApplicationsKeys.list() });
    },
  });
}
