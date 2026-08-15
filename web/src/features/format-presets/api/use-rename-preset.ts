"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { renameFormatPresetRequest } from "./requests";
import { formatPresetsKeys } from "./keys";
import { presetErrorMessage } from "./errors";

/**
 * useRenamePreset — переименование пресета (спека 0020, FR-12): схема не
 * трогается. `res.status` прокидывается через `presetErrorMessage` (спека
 * 0029, FR-21) — конфликт имени (409) переводится в русское объяснение
 * вместо технической строки сервера.
 */
export function useRenamePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { presetId: string; name: string }) => {
      const res = await renameFormatPresetRequest(vars.presetId, vars.name);
      if (!res.ok) throw new Error(presetErrorMessage(res.error, res.status));
      return res.preset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formatPresetsKeys.list() });
    },
  });
}
