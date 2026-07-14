import "server-only";

import { nominationClient } from "@/lib/grpc/client";
import { nominationToJson } from "@/lib/grpc/serialize";
import type { Nomination } from "../lib/types";

/**
 * getNomination — точка получения одной номинации на сервере для SSR
 * страницы управления пулами (спека 0009). Зовёт публичный gRPC
 * GetNomination (без access-токена).
 *
 * Возвращает `null` при пустом id или ошибке gRPC.
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export async function getNomination(id: string): Promise<Nomination | null> {
  if (!id) return null;
  try {
    const res = await nominationClient.getNomination({ id });
    return nominationToJson(res.nomination);
  } catch {
    return null;
  }
}
