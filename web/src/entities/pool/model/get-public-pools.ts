import "server-only";

import { poolPublicClient } from "@/lib/grpc/client";
import { poolsToJson } from "@/lib/grpc/serialize";
import type { Pool } from "../lib/types";

/**
 * getPublicPools — публичные пулы номинации (состав, статус, площадка) на
 * сервере для SSR публичного экрана номинации (спека 0011, FR-11). Зовёт
 * публичный gRPC `ListPublicPools` (без access-токена). Пуст при `draft`
 * раскладке — регулируется сервером, не здесь (FR-11/AC-14).
 *
 * Возвращает пустой список при пустом nominationId или ошибке gRPC.
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export async function getPublicPools(nominationId: string): Promise<Pool[]> {
  if (!nominationId) return [];
  try {
    const res = await poolPublicClient.listPublicPools({ nominationId });
    return poolsToJson(res.pools);
  } catch {
    return [];
  }
}
