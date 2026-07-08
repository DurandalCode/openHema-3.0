import "server-only";

import { tournamentClient } from "@/lib/grpc/client";
import { tournamentToJson } from "@/lib/grpc/serialize";
import type { Tournament } from "../lib/types";

/**
 * getActiveTournament — единственная точка получения активного турнира
 * на сервере для SSR главной страницы. Зовёт публичный gRPC
 * GetActiveTournament (без access-токена).
 *
 * Возвращает `null`, если активный турнир не найден или gRPC упал —
 * главная страница должна работать и без турнира (FR-6/AC-4).
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export async function getActiveTournament(): Promise<Tournament | null> {
  try {
    const res = await tournamentClient.getActiveTournament({});
    const json = tournamentToJson(res.tournament);
    return (json as Tournament | null) ?? null;
  } catch {
    return null;
  }
}