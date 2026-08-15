"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setStageStatusRequest } from "./requests";
import { stageManagementKeys } from "./keys";

/**
 * useSetStageStatus — мутация фиксации/расфиксации состава этапа
 * (draft↔ready, спека 0031, FR-22): переключатель в `stage-inspector.tsx`,
 * вторая точка входа для того же действия, что «Зафиксировать» на экране
 * посева (0030, FR-8) и посева сетки (`nomination-pools`/`bracket-seeding`).
 * Инвалидирует **три** ключа (риск из `plan.md` — «должна покрывать оба, список
 * этапов номинации и раскладку этапа»): список этапов номинации (сводка
 * конфига и статус на карточке схемы читаются оттуда) и раскладку самого
 * этапа — групповую (`nomination-pools`) или сеточную (`bracket-seeding`),
 * какая из них закэширована, зависит от типа этапа, который мутация не
 * знает, поэтому инвалидируются оба возможных ключа (промах — no-op).
 * Импорт `nominationPoolsKeys`/`bracketSeedingKeys` запрещён правилом 6
 * `web/AGENTS.md` (features не импортят друг друга) — ключи продублированы
 * литералом, как и сам фетчер (`setStageStatusRequest`).
 */
export function useSetStageStatus(nominationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { stageId: string; status: "draft" | "ready" }) => {
      const res = await setStageStatusRequest(vars.stageId, vars.status);
      if (!res.ok) throw new Error(res.error);
      return res.status;
    },
    onSuccess: (_status, vars) => {
      qc.invalidateQueries({ queryKey: stageManagementKeys.list(nominationId) });
      qc.invalidateQueries({ queryKey: ["nomination-pools", "layout", vars.stageId] });
      qc.invalidateQueries({ queryKey: ["bracket-seeding", "bracket", vars.stageId] });
    },
  });
}
