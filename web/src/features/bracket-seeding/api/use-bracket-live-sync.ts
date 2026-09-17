"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bracketResultsSignature } from "@/entities/bracket/lib/types";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";
import { bracketSeedingKeys } from "./keys";

/**
 * useBracketLiveSync — оживляет админский вид сетки (спека 0051, FR-8).
 *
 * Сетка уже показывает счёт и состояние пары, но тянет их разовым
 * `useBracket(stageId)`: пока экран открыт, результаты завершающихся боёв
 * плейоффа до него не доезжают. Живой снапшот номинации их знает — но
 * скормить его `BracketSeeding` напрямую нельзя: сервер строит публичную
 * проекцию с `includeUnassigned = false`, то есть без списка тех, кого ещё
 * можно посеять, и редактор посева остался бы без данных. Поэтому источником
 * правды для сетки остаётся админская ручка, а живой канал лишь сообщает,
 * что её пора перечитать.
 *
 * Перечитываем не на каждый кадр, а только когда изменился отпечаток
 * результатов (`bracketResultsSignature`): кадр номинации приходит на любое
 * изменение — включая чужой групповой бой и каждое начисление очка, — и
 * слепая инвалидация превратила бы живой канал в опрос сервера в цикле,
 * что NFR-1 прямо запрещает.
 *
 * No-op, если у этапа нет сетки в снапшоте (групповой этап, либо раскладка
 * ещё в черновике — тогда снапшот её и не содержит).
 */
export function useBracketLiveSync(
  stageId: string,
  snapshot: NominationLiveSnapshotDto | null,
): void {
  const qc = useQueryClient();
  const lastSignatureRef = useRef<string | null>(null);

  const bracket = snapshot?.brackets.find((b) => b.stage.id === stageId) ?? null;
  const signature = bracket ? bracketResultsSignature(bracket) : null;

  useEffect(() => {
    if (signature === null) return;
    const previous = lastSignatureRef.current;
    lastSignatureRef.current = signature;
    // Первый увиденный отпечаток — не «изменение»: перечитывать только что
    // загруженную сетку незачем.
    if (previous === null || previous === signature) return;
    void qc.invalidateQueries({ queryKey: bracketSeedingKeys.bracket(stageId) });
  }, [signature, stageId, qc]);
}
