"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ImportReport } from "@/entities/fighter/lib/types";
import { fighterManagementKeys } from "./keys";
import { importFightersRequest } from "./requests";

export type ImportFightersVars = {
  file: File;
  dryRun: boolean;
  nominationIds?: string[];
};

/**
 * useImportFighters — импорт бойцов из файла (admin, спека 0049). Один и
 * тот же вызов обслуживает оба шага (FR-2): `dryRun: true` — предпросмотр,
 * `dryRun: false` — запись. Файл между шагами живёт в браузере и
 * отправляется повторно, состояния сессии импорта нигде нет.
 *
 * Инвалидация ростера — только после записи: предпросмотр ничего не менял
 * (AC-2), и сбрасывать из-за него кеш значило бы лишний рефетч на каждый
 * выбранный файл. Отчёт в кеш RQ не кладётся — он живёт ровно столько,
 * сколько открыт диалог (`useState`, см. `import-fighters-dialog.tsx`).
 */
export function useImportFighters() {
  const qc = useQueryClient();
  return useMutation<ImportReport, Error, ImportFightersVars>({
    mutationFn: async ({ file, dryRun, nominationIds }) => {
      const res = await importFightersRequest(file, { dryRun, nominationIds });
      if (!res.ok) throw new Error(res.error);
      return res.report;
    },
    onSuccess: (_report, { dryRun }) => {
      if (dryRun) return;
      qc.invalidateQueries({ queryKey: fighterManagementKeys.all() });
    },
  });
}
