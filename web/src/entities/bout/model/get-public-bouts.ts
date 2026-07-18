import "server-only";

import { boutPublicClient } from "@/lib/grpc/client";
import { boutsToJson } from "@/lib/grpc/serialize";
import type { Bout } from "../lib/types";

/**
 * getPublicBouts — публичные бои всех пулов номинации (пары бойцов +
 * порядок проведения) на сервере для SSR публичного экрана номинации
 * (спека 0011, FR-11). Зовёт публичный gRPC `ListPublicBoutsByNomination`
 * (без access-токена) — тот же набор боёв, что и admin-чтение (спека 0010),
 * без фильтрации по готовности (видимость раскладки/пула регулирует
 * `PoolPublicService`, не этот RPC).
 *
 * Возвращает пустой список при пустом nominationId или ошибке gRPC.
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export async function getPublicBouts(nominationId: string): Promise<Bout[]> {
  if (!nominationId) return [];
  try {
    const res = await boutPublicClient.listPublicBoutsByNomination({ nominationId });
    return boutsToJson(res.bouts);
  } catch {
    return [];
  }
}
