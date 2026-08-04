/**
 * Этап номинации (спека 0017/0018, ADR 0014 §1/§3): отдельная сущность, а не
 * поле в `entities/pool`. Номинация может иметь несколько этапов —
 * групповой (`groups`) и/или плейофф-сетку (`bracket`, спека 0018, FR-2).
 *
 * Сериализуемая форма (без bigint/Date). `type` — строковый литерал, как
 * остальные enum-DTO в проекте (`PoolStatus`, `BoutState`, …): значение,
 * которое реально приходит из `stageToJson` (`lib/grpc/serialize.ts`) —
 * полное имя proto-enum (`STAGE_TYPE_GROUPS`/`STAGE_TYPE_BRACKET`), не
 * сокращение. `status` — статус фиксации состава этого этапа (0018, FR-18):
 * до 0018 жил только в `PoolLayout`, теперь нужен в каждой строке списка
 * этапов. `bracket` заполнен только у `type = STAGE_TYPE_BRACKET` (FR-1).
 */

import type { PoolLayoutStatus } from "@/entities/pool/lib/types";

export type StageType =
  | "STAGE_TYPE_UNSPECIFIED"
  | "STAGE_TYPE_GROUPS"
  | "STAGE_TYPE_BRACKET";

export type BracketConfig = {
  size: number;
  thirdPlace: boolean;
};

export type Stage = {
  id: string;
  nominationId: string;
  position: number;
  title: string;
  type: StageType;
  status: PoolLayoutStatus;
  bracket: BracketConfig | null;
};
