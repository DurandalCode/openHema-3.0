import "server-only";

import { nominationClient } from "@/lib/grpc/client";
import { nominationsToJson } from "@/lib/grpc/serialize";
import type { Nomination } from "../lib/types";

/**
 * getNominations — точка получения номинаций турнира на сервере для SSR
 * публичной страницы. Зовёт публичный gRPC ListNominations (без
 * access-токена).
 *
 * Возвращает пустой массив при пустом tournamentId, отсутствии номинаций или
 * ошибке gRPC — публичная страница должна работать без номинаций (FR-12).
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export async function getNominations(tournamentId: string): Promise<Nomination[]> {
  if (!tournamentId) return [];
  try {
    const res = await nominationClient.listNominations({ tournamentId });
    return nominationsToJson(res.nominations);
  } catch {
    return [];
  }
}
