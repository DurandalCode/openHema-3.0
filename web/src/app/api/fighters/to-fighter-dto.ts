import { fighterToJson } from "@/lib/grpc/serialize";
import type { Fighter as FighterDto } from "@/entities/fighter/lib/types";

/**
 * toFighterDto дополняет общий `fighterToJson` (`lib/grpc/serialize.ts`)
 * полями обратной проекции «учётка ↔ боец» (спека 0040, FR-8/FR-10):
 * `linkedAccountId`/`linkedAccountDisplayName`/`mergedIntoId`. Эти поля —
 * простые `string`-поля proto-сообщения (без enum-маппинга), читаются
 * напрямую с ответа gRPC, а не через `toJson`.
 *
 * `fighterToJson` их пока не маппит: это общий сериализатор вне границ
 * трека web-обратной проекции (`web/src/lib/grpc/**`, правится в другом
 * треке/join-волне) — здесь только композиция поверх него, без изменения
 * самого файла.
 */
export function toFighterDto(fighter: Parameters<typeof fighterToJson>[0]): FighterDto | null {
  const base = fighterToJson(fighter);
  if (!base) return null;
  return {
    ...base,
    linkedAccountId: fighter?.linkedAccountId ?? "",
    linkedAccountDisplayName: fighter?.linkedAccountDisplayName ?? "",
    mergedIntoId: fighter?.mergedIntoId ?? "",
  };
}
