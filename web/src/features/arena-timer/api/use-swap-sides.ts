"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/api-fetch";

async function postScoreboardSides(arenaId: string, swapped: boolean): Promise<void> {
  await apiFetch(`/api/arenas/${encodeURIComponent(arenaId)}/scoreboard-sides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ swapped }),
  });
}

/**
 * useSwapSides — смена сторон табло (спека 0015, FR-8). Вынесена из
 * `TimerControls` (спека 0045, T3), чтобы переиспользоваться в мобильном
 * листе действий `BoutActionsSheetContent` без дублирования fetch-логики.
 * Переключена на `apiFetch` вместо голого `fetch` (страж `no-direct-fetch`,
 * спека 0039, NFR-5, обнаружено при выносе из `ui/` в `api/`, где страж уже
 * действует): вызов идёт через `useMutation`, поэтому 401 от `apiFetch`
 * подхватывает существующий `MutationCache.onError` (спека 0038) сам, без
 * ручного `try/catch`, как у fire-and-forget вызовов в `use-arena-timer.ts`.
 */
export function useSwapSides(arenaId: string) {
  return useMutation({
    mutationFn: (swapped: boolean) => postScoreboardSides(arenaId, swapped),
  });
}
