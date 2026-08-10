import "server-only";

import { stagePublicClient } from "@/lib/grpc/client";
import { nominationResultsToJson } from "@/lib/grpc/serialize";
import { emptyNominationResults, type NominationResults } from "../lib/types";

/**
 * getNominationResults — итоговый протокол номинации (спека 0021, FR-9..
 * FR-19) на сервере для SSR админского экрана схемы (`showUnfinished`, FR-19)
 * — организатор сам обновляет страницу, живой канал (0014) там не нужен.
 * Зовёт публичный gRPC `GetNominationResults` (без access-токена), как
 * остальные RPC `StagePublicService`.
 *
 * Возвращает пустой (незавершённый, без секций) протокол при пустом
 * nominationId или ошибке gRPC.
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export async function getNominationResults(nominationId: string): Promise<NominationResults> {
  if (!nominationId) return emptyNominationResults(nominationId);
  try {
    const res = await stagePublicClient.getNominationResults({ nominationId });
    return nominationResultsToJson(res.results) ?? emptyNominationResults(nominationId);
  } catch {
    return emptyNominationResults(nominationId);
  }
}
