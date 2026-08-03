import "server-only";

import { stageAdminClient } from "@/lib/grpc/client";
import { boutBoardToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import type { BoutBoard } from "@/entities/pool/lib/types";

/**
 * getArenaLiveBoard — доска ведения боёв арены на сервере для SSR-инициала
 * табло (спека 0015, T13): тот же `GetBoutBoard` (0013), что уже питает
 * панель ведения боя (`entities/arena` не имеет отдельного геттера доски —
 * этот один переиспользуется и панелью, и табло).
 *
 * Полный `ArenaLiveSnapshot` (таймер/комната) для SSR-инициала не нужен —
 * оба эфемерны (ADR 0013) и появятся из первого кадра `WatchArenaBoard`
 * (SSE `/api/arenas/[id]/live`); SSR нужен только чтобы табло не мигало
 * пустотой до первого кадра.
 *
 * Возвращает `null`, если токена нет, доски нет (арена свободна) или gRPC
 * ответил ошибкой — вызывающая страница/виджет показывает нейтральное
 * «ожидание» (FR-5).
 *
 * Server-only: next/headers (cookies) + connect-node (gRPC).
 */
export async function getArenaLiveBoard(arenaId: string): Promise<BoutBoard | null> {
  if (!arenaId) return null;
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  try {
    const res = await stageAdminClient.getBoutBoard(
      { arenaId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return boutBoardToJson(res.board);
  } catch {
    return null;
  }
}
