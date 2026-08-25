import "server-only";

import { cache } from "react";
import { stagePublicClient } from "@/lib/grpc/client";
import { tournamentLiveToJson } from "@/lib/grpc/serialize";
import { emptyTournamentLiveSnapshot, type TournamentLiveSnapshotDto } from "../lib/types";

/**
 * getTournamentLive — живая сводка турнира (спека 0034, FR-12..FR-22) на
 * сервере для SSR-инициала главной страницы. Зовёт публичный gRPC
 * `GetTournamentLive` (без access-токена) — тот же снапшот, что первый кадр
 * `WatchTournamentLive`. По образцу `getNominationLive`.
 *
 * Возвращает пустой снапшот при пустом tournamentId (турнира нет — FR-2) или
 * ошибке gRPC — главная должна оставаться рабочей в фазе «до старта».
 *
 * Обёрнута в React `cache()` (спека 0039, T15, NFR-3) — дедуп по
 * `tournamentId` в пределах одного серверного рендера: главная и `Navbar`
 * (через `getPublicPhase`) делят один вызов вместо двух.
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export const getTournamentLive = cache(async function getTournamentLive(
  tournamentId: string,
): Promise<TournamentLiveSnapshotDto> {
  if (!tournamentId) return emptyTournamentLiveSnapshot(tournamentId);
  try {
    const res = await stagePublicClient.getTournamentLive({ tournamentId });
    return tournamentLiveToJson(res.snapshot) ?? emptyTournamentLiveSnapshot(tournamentId);
  } catch {
    return emptyTournamentLiveSnapshot(tournamentId);
  }
});
