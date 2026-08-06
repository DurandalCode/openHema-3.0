"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { renameFormatPresetRequest } from "./requests";
import { formatPresetsKeys } from "./keys";

/** useRenamePreset — переименование пресета (спека 0020, FR-12): схема не трогается. */
export function useRenamePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { presetId: string; name: string }) => {
      const res = await renameFormatPresetRequest(vars.presetId, vars.name);
      if (!res.ok) throw new Error(res.error);
      return res.preset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formatPresetsKeys.list() });
    },
  });
}
