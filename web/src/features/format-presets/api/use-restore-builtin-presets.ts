"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { restoreBuiltinPresetsRequest } from "./requests";
import { formatPresetsKeys } from "./keys";
import { presetErrorMessage } from "./errors";

/**
 * useRestoreBuiltinPresets — мутация «восстановить встроенные пресеты»
 * (спека 0047, FR-10): заводит записи каталога, которых в библиотеке сейчас
 * нет (по имени), остальные не трогает (FR-9/FR-11). Отказ прокидывается
 * через `presetErrorMessage` — тот же приём, что у `useSavePreset`/
 * `useDeletePreset`.
 */
export function useRestoreBuiltinPresets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await restoreBuiltinPresetsRequest();
      if (!res.ok) throw new Error(presetErrorMessage(res.error, res.status));
      return { restored: res.restored, skipped: res.skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formatPresetsKeys.list() });
    },
  });
}
