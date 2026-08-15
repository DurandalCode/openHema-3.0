"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveFormatPresetRequest } from "./requests";
import { formatPresetsKeys } from "./keys";
import { presetErrorMessage } from "./errors";

/**
 * useSavePreset — мутация «сохранить схему номинации как пресет» (спека
 * 0020, FR-11/FR-12): отпечаток схемы на момент вызова (FR-16), имя
 * обязательно и уникально (AC-17, сервер отвечает 409). `res.status`
 * прокидывается через `presetErrorMessage` (спека 0031, FR-27) — тот же
 * приём, что у переименования/удаления пресета (0029).
 */
export function useSavePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string; nominationId: string }) => {
      const res = await saveFormatPresetRequest(vars.name, vars.nominationId);
      if (!res.ok) throw new Error(presetErrorMessage(res.error, res.status));
      return res.preset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formatPresetsKeys.list() });
    },
  });
}
