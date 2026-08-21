/**
 * Журнал боёв площадки (спека 0033, FR-33/FR-34): чистое форматирование
 * записей события бой — `GetArenaJournal` (proto `BoutJournalEntry`). Сами
 * записи читает `features/arena-journal` (RQ); здесь только текст и время,
 * без React и без сети.
 */

import { parseIsoToDate } from "@/shared/lib/datetime";

/**
 * JournalEntryKindDto — зеркалит `hema.v1.BoutEventKind` (proto) строковым
 * литералом, как остальные *Dto-перечисления этого среза. `scheduled`
 * (формирование пар, 0010) сервер наружу не отдаёт (spec FR-34/FR-36) —
 * этого варианта здесь нет.
 */
export type JournalEntryKindDto =
  | "BOUT_EVENT_KIND_UNSPECIFIED"
  | "BOUT_EVENT_KIND_STARTED"
  | "BOUT_EVENT_KIND_SCORED"
  | "BOUT_EVENT_KIND_FINISHED"
  | "BOUT_EVENT_KIND_REOPENED"
  | "BOUT_EVENT_KIND_RESET";

export type JournalEntryDto = {
  boutId: string;
  sequenceNumber: number;
  fighterA: { fighterId: string; name: string; club: string };
  fighterB: { fighterId: string; name: string; club: string };
  kind: JournalEntryKindDto;
  scoreA: number;
  scoreB: number;
  /** occurredAt — ISO, как отдаёт BFF (сериализованный `Timestamp`). */
  occurredAt: string;
  /**
   * actorDisplayName — обогащение на чтении (приём 0025). Пусто, если
   * пользователь удалён — `journalEntryText` от этого не зависит: имя
   * автора рендерит `arena-journal` отдельным полем, не эта функция.
   */
  actorDisplayName: string;
};

/**
 * journalEntryText — текст строки журнала по образцу макета 16a
 * («бой 7 начат», «бой 6 завершён · Ильин 2 : 5 Дерюгин», AC-19).
 * `SCORED`/`REOPENED`/`RESET` не в макете — формулировка выдержана в том же
 * лаконичном тоне (решение агента, spec оставляла выбор).
 */
export function journalEntryText(entry: JournalEntryDto): string {
  const bout = `бой ${entry.sequenceNumber}`;
  switch (entry.kind) {
    case "BOUT_EVENT_KIND_STARTED":
      return `${bout} начат`;
    case "BOUT_EVENT_KIND_FINISHED":
      return `${bout} завершён · ${entry.fighterA.name} ${entry.scoreA} : ${entry.scoreB} ${entry.fighterB.name}`;
    case "BOUT_EVENT_KIND_SCORED":
      return `${bout} · счёт ${entry.scoreA} : ${entry.scoreB}`;
    case "BOUT_EVENT_KIND_REOPENED":
      return `${bout} переоткрыт`;
    case "BOUT_EVENT_KIND_RESET":
      return `${bout} сброшен`;
    default:
      return bout;
  }
}

/** journalEntryTime — `occurredAt` как `HH:MM:SS` (макет 16a: «14:12:40»). */
export function journalEntryTime(entry: JournalEntryDto): string {
  const date = parseIsoToDate(entry.occurredAt);
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
