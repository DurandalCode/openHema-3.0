"use client";

import { useMutation } from "@tanstack/react-query";

async function postScoreboardSides(arenaId: string, swapped: boolean): Promise<void> {
  await fetch(`/api/arenas/${encodeURIComponent(arenaId)}/scoreboard-sides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ swapped }),
  });
}

/**
 * useSwapSides — смена сторон табло (спека 0015, FR-8). Вынесена из
 * `TimerControls` (спека 0045, T3), чтобы переиспользоваться в мобильном
 * листе действий `BoutActionsSheetContent` без дублирования fetch-логики.
 */
export function useSwapSides(arenaId: string) {
  return useMutation({
    mutationFn: (swapped: boolean) => postScoreboardSides(arenaId, swapped),
  });
}
