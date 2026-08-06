"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteFormatPresetRequest } from "./requests";
import { formatPresetsKeys } from "./keys";

/**
 * useDeletePreset — удаление пресета (спека 0020, FR-12): не трогает
 * номинации, к которым он уже применялся (FR-16).
 */
export function useDeletePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (presetId: string) => {
      const res = await deleteFormatPresetRequest(presetId);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formatPresetsKeys.list() });
    },
  });
}
