/**
 * arenaLiveStatus — живой статус площадки (спека 0027, FR-3), вычисленный
 * чистой функцией из доски ведения боёв (`BoutBoard`, спека 0013). Ядро
 * колонки «Состояние» списка площадок: экран ничего не решает о ведении
 * боя, только читает производную величину (spec NFR-2).
 *
 * Опирается на уже существующие `boutNumber`/`nextBout` (`./types`) — вторая
 * реализация «какой бой по счёту» здесь не заводится.
 */

import type { BoutBoard, BoardBout } from "@/entities/pool/lib/types";
import { boutNumber, nextBout } from "./types";

/**
 * ArenaLiveStatusKind — все состояния строки площадки. `arenaLiveStatus`
 * производит только «оперативные» kind'ы (`free`/`preparing`/`bout`/
 * `between`/`finished`); `archived`/`unknown` выставляет вызывающий код
 * `features/arena-management` для архивных площадок и площадок с ошибкой
 * запроса доски (spec FR-5/FR-10) — не эта функция.
 */
export type ArenaLiveStatusKind =
  | "free"
  | "preparing"
  | "bout"
  | "between"
  | "finished"
  | "archived"
  | "unknown";

export type ArenaLiveStatus = {
  kind: ArenaLiveStatusKind;
  /** title — «Идёт бой · Кравцов — Ильин». */
  title: string;
  /** detail — «Длинный меч · Пул A · бой 14 из 18 · 3:2», либо null (free). */
  detail: string | null;
  /** pulse — true только для kind === "bout" (spec FR-4, motion-safe). */
  pulse: boolean;
};

const FREE_STATUS: ArenaLiveStatus = { kind: "free", title: "Свободна", detail: null, pulse: false };

function poolContext(board: BoutBoard): string {
  const pool = board.pool;
  // Вызывается только когда board.pool не null (проверено в arenaLiveStatus).
  return `${pool!.nominationName} · ${pool!.name}`;
}

/**
 * firstUnfinishedBySequence — резерв на случай, если `nextBout` (который
 * ищет строго после текущего боя) ничего не нашёл: первый непроведённый
 * (не `FINISHED`) бой пула по `sequenceNumber` (spec T2, «между боями»).
 */
function firstUnfinishedBySequence(board: BoutBoard): BoardBout | null {
  const sorted = [...board.bouts].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return sorted.find((b) => b.state !== "BOUT_STATE_FINISHED") ?? null;
}

export function arenaLiveStatus(board: BoutBoard | null): ArenaLiveStatus {
  if (!board || !board.pool) return FREE_STATUS;

  const context = poolContext(board);

  if (board.bouts.length === 0) {
    return { kind: "preparing", title: "Пул готовится", detail: context, pulse: false };
  }

  if (board.bouts.every((b) => b.state === "BOUT_STATE_FINISHED")) {
    return { kind: "finished", title: "Пул завершён", detail: context, pulse: false };
  }

  const currentBout = board.bouts.find((b) => b.id === board.currentBoutId) ?? null;

  if (currentBout && currentBout.state === "BOUT_STATE_IN_PROGRESS") {
    const num = boutNumber(board);
    const detail = num
      ? `${context} · бой ${num.current} из ${num.total} · ${currentBout.scoreA}:${currentBout.scoreB}`
      : context;
    return {
      kind: "bout",
      title: `Идёт бой · ${currentBout.fighterA.name} — ${currentBout.fighterB.name}`,
      detail,
      pulse: true,
    };
  }

  if (board.bouts.every((b) => b.state === "BOUT_STATE_NOT_STARTED")) {
    return { kind: "preparing", title: "Пул готовится", detail: context, pulse: false };
  }

  const upcoming = nextBout(board) ?? firstUnfinishedBySequence(board);
  const num = boutNumber(board);
  const detail = num ? `${context} · бой ${num.current} из ${num.total}` : context;
  const title = upcoming
    ? `Между боями · далее ${upcoming.fighterA.name} — ${upcoming.fighterB.name}`
    : "Между боями";
  return { kind: "between", title, detail, pulse: false };
}
