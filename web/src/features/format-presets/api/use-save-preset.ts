"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveFormatPresetRequest } from "./requests";
import { formatPresetsKeys } from "./keys";

/**
 * useSavePreset — мутация «сохранить схему номинации как пресет» (спека
 * 0020, FR-11/FR-12): отпечаток схемы на момент вызова (FR-16), имя
 * обязательно и уникально (AC-17, сервер отвечает 409).
 */
export function useSavePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { name: string; nominationId: string }) => {
      const res = await saveFormatPresetRequest(vars.name, vars.nominationId);
      if (!res.ok) throw new Error(res.error);
      return res.preset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formatPresetsKeys.list() });
    },
  });
}
