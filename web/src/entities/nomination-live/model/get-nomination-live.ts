import "server-only";

import { stagePublicClient } from "@/lib/grpc/client";
import { nominationLiveToJson } from "@/lib/grpc/serialize";
import { emptyNominationLiveSnapshot, type NominationLiveSnapshotDto } from "../lib/types";

/**
 * getNominationLive — живой снапшот номинации (спека 0014, FR-1..FR-4) на
 * сервере для SSR-инициала публичного экрана номинации. Зовёт публичный
 * gRPC `GetNominationLive` (без access-токена) — тот же снапшот, что первый
 * кадр `WatchNominationLive`. Пустой список пулов, пока раскладка `draft`
 * (FR-12, как `getPublicPools`).
 *
 * Возвращает пустой снапшот при пустом nominationId или ошибке gRPC.
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export async function getNominationLive(nominationId: string): Promise<NominationLiveSnapshotDto> {
  if (!nominationId) return emptyNominationLiveSnapshot(nominationId);
  try {
    const res = await stagePublicClient.getNominationLive({ nominationId });
    return nominationLiveToJson(res.snapshot) ?? emptyNominationLiveSnapshot(nominationId);
  } catch {
    return emptyNominationLiveSnapshot(nominationId);
  }
}
