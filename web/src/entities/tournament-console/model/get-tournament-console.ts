import "server-only";

import { stageAdminClient } from "@/lib/grpc/client";
import { consoleSnapshotToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { emptyConsoleSnapshot, type TournamentConsoleSnapshotDto } from "../lib/types";

/**
 * getTournamentConsole — пульт турнира (спека 0043, FR-8/FR-9/FR-19) на
 * сервере для SSR-инициала экрана `/admin/console`. Зовёт admin-only gRPC
 * `GetTournamentConsole` напрямую — тот же снапшот, что первый кадр
 * `WatchTournamentConsole`. По образцу `getArenaLiveBoard`.
 *
 * Возвращает пустой снапшот при пустом `tournamentId`, отсутствии токена
 * (сама страница/middleware решает, пускать ли гостя на `/admin/**`, эта
 * функция лишь не падает) или ошибке gRPC — экран должен оставаться
 * рабочим и без данных (пустой турнир — штатное состояние, NFR-4).
 *
 * Server-only: next/headers (cookies) + connect-node (gRPC).
 */
export async function getTournamentConsole(tournamentId: string): Promise<TournamentConsoleSnapshotDto> {
  if (!tournamentId) return emptyConsoleSnapshot(tournamentId);
  const accessToken = await getAccessToken();
  if (!accessToken) return emptyConsoleSnapshot(tournamentId);
  try {
    const res = await stageAdminClient.getTournamentConsole(
      { tournamentId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return consoleSnapshotToJson(res.snapshot) ?? emptyConsoleSnapshot(tournamentId);
  } catch {
    return emptyConsoleSnapshot(tournamentId);
  }
}
