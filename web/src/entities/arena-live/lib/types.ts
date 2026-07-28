/**
 * Живой снапшот табло арены (спека 0015): доска ведения (0013) + недоменный
 * таймер (клиент-авторитет, ADR 0013) + состав живой комнаты (нумерация
 * табло/источник, FR-11/FR-12) + персистентный дефолт длительности арены.
 * Переиспользует существующие DTO `entities/pool` (`BoutBoard`/`BoardBout`)
 * — не дублирует их поля.
 */

import type { BoutBoard as BoutBoardDto, BoardBout as BoardBoutDto } from "@/entities/pool/lib/types";

export { outcomeOf } from "@/entities/pool/lib/types";

/**
 * TimerStatusDto — состояние недоменного таймера (спека 0015, FR-9). Строго
 * зеркалит `hema.v1.TimerStatus` (proto), но как строковый литерал (как
 * `BoutStateDto`), не число.
 */
export type TimerStatusDto =
  | "TIMER_STATUS_UNSPECIFIED"
  | "TIMER_STATUS_STOPPED"
  | "TIMER_STATUS_RUNNING"
  | "TIMER_STATUS_PAUSED"
  | "TIMER_STATUS_EXPIRED";

/** ScoreboardRoleDto — роль подписчика живого канала табло арены (FR-11/FR-12). */
export type ScoreboardRoleDto =
  | "SCOREBOARD_ROLE_UNSPECIFIED"
  | "SCOREBOARD_ROLE_SCOREBOARD"
  | "SCOREBOARD_ROLE_PANEL";

/** TimerCommandKindDto — команды панели управления таймером (спека 0015, FR-7). */
export type TimerCommandKindDto =
  | "TIMER_COMMAND_KIND_UNSPECIFIED"
  | "TIMER_COMMAND_KIND_START"
  | "TIMER_COMMAND_KIND_PAUSE"
  | "TIMER_COMMAND_KIND_RESET"
  | "TIMER_COMMAND_KIND_ADJUST";

/**
 * TimerFrameDto — полное состояние таймера в момент `sampledUnixMs` (по
 * часам авторитетного табло, ADR 0013). `sampledUnixMs` — int64 в proto,
 * `toJson` сериализует его строкой (проверено по факту сгенерированного
 * кода), поэтому здесь `string`, не `number`/`bigint`.
 */
export type TimerFrameDto = {
  status: TimerStatusDto;
  remainingCs: number;
  sampledUnixMs: string;
  defaultCs: number;
};

/**
 * ScoreboardRoomDto — состав живой комнаты арены с точки зрения текущего
 * подписчика (спека 0015, FR-11/FR-12).
 */
export type ScoreboardRoomDto = {
  scoreboardCount: number;
  thisOrdinal: number;
  thisIsSource: boolean;
  sidesSwapped: boolean;
};

/**
 * TimerCommandDto — команда таймера, ретранслируемая сервером от панели
 * авторитетному табло (спека 0015, FR-7). `amountSeconds` — знаковое,
 * используется только для `TIMER_COMMAND_KIND_ADJUST`.
 */
export type TimerCommandDto = {
  kind: TimerCommandKindDto;
  amountSeconds: number;
};

/**
 * ArenaLiveSnapshotDto — живой снапшот табло арены целиком (спека 0015):
 * доска (`null`, если на арене никто не стоит — FR-5), последнее известное
 * состояние таймера, состав комнаты для этого подписчика, персистентный
 * дефолт арены и серверное время в момент отправки кадра (опора клиентской
 * синхронизации часов, `serverNowUnixMs` — int64 → строка, как выше).
 */
export type ArenaLiveSnapshotDto = {
  board: BoutBoardDto | null;
  timer: TimerFrameDto;
  room: ScoreboardRoomDto;
  defaultDurationSeconds: number;
  serverNowUnixMs: string;
};

/**
 * nextBout — следующий по порядку (0010) непроведённый бой пула после
 * текущего (спека 0015, FR-4). `null`, если доски/пула/текущего боя нет,
 * либо текущий бой — последний непроведённый в пуле (AC-3a, «последний
 * бой» — деталь отображения виджета, не этой функции).
 */
export function nextBout(board: BoutBoardDto | null): BoardBoutDto | null {
  if (!board || !board.pool || board.bouts.length === 0) return null;
  const sorted = [...board.bouts].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const currentIndex = sorted.findIndex((b) => b.id === board.currentBoutId);
  if (currentIndex === -1) return null;
  for (let i = currentIndex + 1; i < sorted.length; i += 1) {
    if (sorted[i].state !== "BOUT_STATE_FINISHED") return sorted[i];
  }
  return null;
}

/**
 * boutNumber — порядковый номер текущего боя среди всех боёв пула + общее
 * число («Бой N из M», спека 0015, шапка табло). `null`, если доски/пула/
 * текущего боя нет.
 */
export function boutNumber(board: BoutBoardDto | null): { current: number; total: number } | null {
  if (!board || !board.pool || board.bouts.length === 0) return null;
  const sorted = [...board.bouts].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const currentIndex = sorted.findIndex((b) => b.id === board.currentBoutId);
  if (currentIndex === -1) return null;
  return { current: currentIndex + 1, total: sorted.length };
}

/**
 * emptyTimerFrame — безопасный дефолт таймера, пока не пришёл ни один кадр
 * от авторитета (комната только что открылась / №1 ещё не публиковал).
 */
export function emptyTimerFrame(defaultCs: number): TimerFrameDto {
  return { status: "TIMER_STATUS_STOPPED", remainingCs: defaultCs, sampledUnixMs: "0", defaultCs };
}

/** emptyScoreboardRoom — безопасный дефолт комнаты (нет подписчиков). */
export function emptyScoreboardRoom(): ScoreboardRoomDto {
  return { scoreboardCount: 0, thisOrdinal: 0, thisIsSource: false, sidesSwapped: false };
}
