import "server-only";

import { applicationPublicClient } from "@/lib/grpc/client";
import { nominationParticipantsToJson } from "@/lib/grpc/serialize";
import type { NominationParticipants } from "../lib/types";

const EMPTY: NominationParticipants = {
  participants: [],
  appliedCount: 0,
  confirmedCount: 0,
  fighterCapacity: null,
};

/**
 * getNominationParticipants — точка получения публичного стартового листа
 * номинации на сервере для SSR публичной страницы (FR-15/FR-16). Зовёт
 * публичный gRPC ListNominationParticipants (без access-токена).
 *
 * Возвращает пустой стартовый лист при пустом nominationId или ошибке gRPC —
 * публичная страница должна работать без заявок.
 *
 * Server-only: connect-node (gRPC) не работает в браузере.
 */
export async function getNominationParticipants(
  nominationId: string,
): Promise<NominationParticipants> {
  if (!nominationId) return EMPTY;
  try {
    const res = await applicationPublicClient.listNominationParticipants({ nominationId });
    return {
      participants: nominationParticipantsToJson(res.participants),
      appliedCount: res.appliedCount,
      confirmedCount: res.confirmedCount,
      fighterCapacity: res.fighterCapacity ?? null,
    };
  } catch {
    return EMPTY;
  }
}
