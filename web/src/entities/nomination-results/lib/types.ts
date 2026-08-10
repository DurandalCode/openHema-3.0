/**
 * Итоговый протокол номинации (спека 0021): секция на каждый терминальный
 * этап (FR-9/FR-10), у каждой — свой пьедестал. Место — диапазон «от–до»
 * (FR-11): одиночное место — вырожденный диапазон (`placeFrom == placeTo`).
 * Сквозной нумерации мест по номинации нет — каждая секция независима.
 *
 * Сериализуемая форма (без bigint/Date). `fighter` переиспользует
 * `entities/pool` `FighterRef` — та же снимок-проекция бойца (id/имя/клуб),
 * что и везде в этом слое (пул, доска боёв, сетка), отдельной копии не
 * заводим. `stageType` переиспользует `entities/stage` `StageType` (те же
 * строковые литералы, что и у `Stage.type`).
 */

import type { FighterRef } from "@/entities/pool/lib/types";
import type { StageType } from "@/entities/stage/lib/types";

/**
 * NominationResultEntry — строка итогового протокола (спека 0021, FR-13):
 * место (диапазон), боец и происхождение места человеческими словами
 * («выбыл в 1/4 финала», «Группа 2, место 1»). Ни счёта, ни статистики боёв
 * не дублирует — это уже есть в таблицах пула (0016) и в сетке (0018).
 */
export type NominationResultEntry = {
  placeFrom: number;
  placeTo: number;
  fighter: FighterRef;
  originLabel: string;
};

/**
 * NominationResultsSection — пьедестал одного терминального этапа (FR-9/
 * FR-10). `finished = false` ⇒ `entries` пуст (FR-15): пока этап не доигран,
 * мест нет вовсе. `placesFromOverallOrder = true` — места взяты из сводного
 * порядка нескольких групп (FR-12) — известное искажение без нормировки на
 * размер группы (0019, NFR-2), интерфейс обязан показать оговорку.
 */
export type NominationResultsSection = {
  stageId: string;
  stageTitle: string;
  stageType: StageType;
  finished: boolean;
  entries: NominationResultEntry[];
  placesFromOverallOrder: boolean;
};

/**
 * NominationResults — итоговый протокол номинации целиком: секция на каждый
 * терминальный этап (FR-10). `nominationFinished` отражает статус номинации
 * (FR-4) — управляет показом блока призёров номинации (FR-15), отдельно от
 * `finished` каждой секции.
 */
export type NominationResults = {
  nominationId: string;
  nominationFinished: boolean;
  sections: NominationResultsSection[];
};

/** emptyNominationResults — безопасный фолбэк (ошибка gRPC/пустой id). */
export function emptyNominationResults(nominationId: string): NominationResults {
  return { nominationId, nominationFinished: false, sections: [] };
}

/**
 * formatPlace — «5» для одиночного места, «5–8» для диапазона (спека 0021,
 * FR-11). Тире — en dash («–»), как принято в спеке, не дефис.
 */
export function formatPlace(entry: NominationResultEntry): string {
  return entry.placeFrom === entry.placeTo
    ? String(entry.placeFrom)
    : `${entry.placeFrom}–${entry.placeTo}`;
}

/**
 * podium — строки секции, чей диапазон пересекает призовые места 1–3 (спека
 * 0021, FR-17): при диапазоне `3–4` без боя за 3-е место в пьедестал попадают
 * обе строки этого диапазона.
 */
export function podium(section: NominationResultsSection): NominationResultEntry[] {
  return section.entries.filter((e) => e.placeFrom <= 3);
}

/**
 * hasPlaces — есть ли у секции места для показа: этап доигран (FR-15) и
 * протокол непуст (пустой контейнер, AC-16, не даёт строк).
 */
export function hasPlaces(section: NominationResultsSection): boolean {
  return section.finished && section.entries.length > 0;
}
