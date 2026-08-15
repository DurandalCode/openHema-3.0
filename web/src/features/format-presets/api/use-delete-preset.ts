"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteFormatPresetRequest } from "./requests";
import { formatPresetsKeys } from "./keys";
import { presetErrorMessage } from "./errors";

/**
 * useDeletePreset — удаление пресета (спека 0020, FR-12): не трогает
 * номинации, к которым он уже применялся (FR-16). `res.status` прокидывается
 * через `presetErrorMessage` (спека 0029, FR-21/FR-22), как у переименования.
 */
export function useDeletePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (presetId: string) => {
      const res = await deleteFormatPresetRequest(presetId);
      if (!res.ok) throw new Error(presetErrorMessage(res.error, res.status));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formatPresetsKeys.list() });
    },
  });
}
