/**
 * Этап номинации (спека 0017, ADR 0014 §1/§3): отдельная сущность, а не поле
 * в `entities/pool`, — этап переживёт 0018/0019 (второй этап, брекет) как
 * самостоятельное понятие. В этом инкременте у номинации ровно один этап
 * (`groups`, «Групповой этап», position 0), не создаваемый/не редактируемый
 * через интерфейс (FR-12) — только отображаемый как подпись состава пулов.
 *
 * Сериализуемая форма (без bigint/Date). `type` — строковый литерал, как
 * остальные enum-DTO в проекте (`PoolStatus`, `BoutState`, …): значение,
 * которое реально приходит из `stageToJson` (`lib/grpc/serialize.ts`) —
 * полное имя proto-enum (`STAGE_TYPE_GROUPS`), не сокращение "groups".
 */

export type StageType = "STAGE_TYPE_UNSPECIFIED" | "STAGE_TYPE_GROUPS";

export type Stage = {
  id: string;
  nominationId: string;
  position: number;
  title: string;
  type: StageType;
};
