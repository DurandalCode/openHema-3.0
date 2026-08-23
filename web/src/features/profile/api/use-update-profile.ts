"use client";

import { useMutation } from "@tanstack/react-query";
import { updateProfileRequest, type UpdateProfileInput } from "./requests";

/**
 * useUpdateProfile — мутация правки имени/клуба (спека 0038, FR-23).
 * Бросает Error при `!ok` (пустое имя и т.п.), чтобы `mutation.error.message`
 * был доступен диалогу. `UnauthorizedError` из `updateProfileRequest`
 * (401) пробрасывается как есть — её ловит глобальный `MutationCache.onError`
 * (`shared/lib/query-client.ts`).
 */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      const result = await updateProfileRequest(input);
      if (!result.ok) throw new Error(result.error);
      return result.user;
    },
  });
}
