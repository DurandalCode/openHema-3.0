import "server-only";

import { fighterPublicClient } from "@/lib/grpc/client";
import { rosterEntriesToJson } from "@/lib/grpc/serialize";
import type { RosterEntry } from "../lib/types";

/**
 * getNominationRoster — публичный состав номинации (бойцы, не заявки) на
 * сервере для SSR (спека 0007, FR-12). Зовёт публичный gRPC
 * ListNominationRoster (без access-токена).
 *
 * Отдельно от entities/application/model/get-nomination-participants —
 * та функция про воронку заявок (0005), эта про реальный ростер бойцов.
 * Какую показывать пользователю (заявки vs бойцы) — решается на уровне UX
 * (спека 0007, п.5 «Принятые решения»), не здесь.
 *
 * Возвращает пустой список при пустом nominationId или ошибке gRPC.
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export async function getNominationRoster(nominationId: string): Promise<RosterEntry[]> {
  if (!nominationId) return [];
  try {
    const res = await fighterPublicClient.listNominationRoster({ nominationId });
    return rosterEntriesToJson(res.entries);
  } catch {
    return [];
  }
}
