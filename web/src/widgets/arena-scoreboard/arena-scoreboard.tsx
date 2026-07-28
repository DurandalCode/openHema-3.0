"use client";

import { useEffect, useRef, useState } from "react";
import { useArenaLive } from "@/features/arena-live/api/use-arena-live";
import { useArenaTimer } from "@/features/arena-timer/api/use-arena-timer";
import { TimerDisplay } from "@/features/arena-timer/ui/TimerDisplay";
import { nextBout, boutNumber, outcomeOf } from "@/entities/arena-live/lib/types";
import type { BoutBoard as BoutBoardDto, FighterRef } from "@/entities/pool/lib/types";

type Color = "blue" | "red";

/** colorOfFighterA — цвет бойца A по умолчанию красный, синий при swap (FR-6). */
function colorOfFighterA(sidesSwapped: boolean): Color {
  return sidesSwapped ? "blue" : "red";
}

/**
 * ArenaScoreboard — полноэкранное табло арены (спека 0015): текущий бой
 * (синий/красный, счёт), таймер, следующая пара, оглашение победителя.
 * Read-only (FR-17) — нет обработчиков, меняющих состояние.
 *
 * Корневой `fixed inset-0 z-50 bg-background` перекрывает родительский
 * chrome (Navbar/AdminNav) на весь просмотр без второго root layout
 * (см. поправку к плану — Next.js App Router не даёт снять родительский
 * layout, а второй root потребовал бы убрать общий `app/layout.tsx`).
 */
export function ArenaScoreboard({
  arenaId,
  arenaName,
  initialBoard,
}: {
  arenaId: string;
  arenaName: string;
  initialBoard: BoutBoardDto | null;
}) {
  const live = useArenaLive(arenaId, "scoreboard", initialBoard);
  const { display } = useArenaTimer(arenaId, live);
  const snapshot = live.snapshot;
  const board = snapshot?.board ?? null;
  const room = snapshot?.room ?? { scoreboardCount: 0, thisOrdinal: 0, thisIsSource: false, sidesSwapped: false };

  // Оглашение результата (спека 0015, FR-14/AC-11a/AC-11b): сервер
  // авто-продвигает `currentBoutId` на следующий бой СРАЗУ по завершении
  // (0013, FinishCurrentBout) — тот же снапшот уже несёт новый
  // `currentBoutId`. Табло не полагается на «currentBoutId изменился» как
  // сигнал перехода (он меняется мгновенно) — держит показ только что
  // завершённого боя, пока секретарь явно не начнёт/не выберет следующий
  // (следующий бой становится не NOT_STARTED, либо currentBoutId
  // переключается ещё раз на третий бой — циркуляция).
  const [displayedBoutId, setDisplayedBoutId] = useState<string | null>(board?.currentBoutId || null);
  const advanceTargetRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const rawCurrentId = board?.currentBoutId || null;

    if (!initializedRef.current) {
      initializedRef.current = true;
      setDisplayedBoutId(rawCurrentId);
      return;
    }

    setDisplayedBoutId((prevDisplayed) => {
      if (rawCurrentId === prevDisplayed) return prevDisplayed;

      const displayedState = board?.bouts.find((b) => b.id === prevDisplayed)?.state;
      const isHoldingAnnouncement = displayedState === "BOUT_STATE_FINISHED";

      if (isHoldingAnnouncement && advanceTargetRef.current === null) {
        advanceTargetRef.current = rawCurrentId;
        return prevDisplayed;
      }

      if (advanceTargetRef.current !== null) {
        if (rawCurrentId !== advanceTargetRef.current) {
          advanceTargetRef.current = null;
          return rawCurrentId;
        }
        const candidate = board?.bouts.find((b) => b.id === rawCurrentId);
        if (candidate && candidate.state !== "BOUT_STATE_NOT_STARTED") {
          advanceTargetRef.current = null;
          return rawCurrentId;
        }
        return prevDisplayed;
      }

      return rawCurrentId;
    });
  }, [board?.currentBoutId, board?.bouts]);

  const displayedBout = board?.bouts.find((b) => b.id === displayedBoutId) ?? null;

  if (!board || !board.pool || !displayedBout) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-2xl text-muted-foreground">{arenaName || "Табло"}</p>
        <p className="text-4xl font-semibold">Ожидание боя…</p>
      </div>
    );
  }

  const number = boutNumber(board);
  const upNext = nextBout(board);

  const blueFighter: FighterRef = room.sidesSwapped ? displayedBout.fighterA : displayedBout.fighterB;
  const blueScore = room.sidesSwapped ? displayedBout.scoreA : displayedBout.scoreB;
  const redFighter: FighterRef = room.sidesSwapped ? displayedBout.fighterB : displayedBout.fighterA;
  const redScore = room.sidesSwapped ? displayedBout.scoreB : displayedBout.scoreA;

  const finished = displayedBout.state === "BOUT_STATE_FINISHED";
  const outcome = finished ? outcomeOf(displayedBout.scoreA, displayedBout.scoreB) : null;
  const outcomeColor: Color | null =
    outcome === "A"
      ? colorOfFighterA(room.sidesSwapped)
      : outcome === "B"
        ? colorOfFighterA(room.sidesSwapped) === "blue"
          ? "red"
          : "blue"
        : null;
  const outcomeLabel =
    outcome === "draw" ? "Ничья" : outcome === "A" ? displayedBout.fighterA.name : outcome === "B" ? displayedBout.fighterB.name : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-6 overflow-y-auto bg-background p-6 sm:p-10">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">{arenaName || "Табло"}</h1>
        <p className="text-muted-foreground">
          {board.pool.nominationName}
          {board.pool.name ? ` · ${board.pool.name}` : ""}
        </p>
        {number && (
          <p className="text-sm text-muted-foreground">
            Бой {number.current} из {number.total}
          </p>
        )}
      </header>

      <div className="grid flex-1 grid-cols-1 items-center gap-6 sm:grid-cols-2">
        <FighterPanel color="blue" fighter={blueFighter} score={blueScore} />
        <FighterPanel color="red" fighter={redFighter} score={redScore} />
      </div>

      <div className="flex flex-col items-center gap-2">
        <TimerDisplay status={display.status} remainingCs={display.remainingCs} />
      </div>

      {finished && outcomeLabel && (
        <div
          data-testid="outcome-announcement"
          className={
            outcomeColor === "blue"
              ? "rounded-lg bg-blue-600/10 p-4 text-center text-3xl font-bold text-blue-600"
              : outcomeColor === "red"
                ? "rounded-lg bg-red-600/10 p-4 text-center text-3xl font-bold text-red-600"
                : "rounded-lg bg-muted p-4 text-center text-3xl font-bold"
          }
        >
          {outcome === "draw" ? "Ничья" : `Победа: ${outcomeLabel}`}
        </div>
      )}

      <footer className="text-center text-lg text-muted-foreground">
        {upNext ? (
          <p>
            Далее: {upNext.fighterA.name} — {upNext.fighterB.name}
          </p>
        ) : (
          <p>Последний бой пула</p>
        )}
      </footer>
    </div>
  );
}

function FighterPanel({ color, fighter, score }: { color: Color; fighter: FighterRef; score: number }) {
  return (
    <div
      data-color={color}
      className={
        color === "blue"
          ? "flex flex-col items-center gap-2 rounded-xl bg-blue-600/10 p-6 text-blue-700 dark:text-blue-400"
          : "flex flex-col items-center gap-2 rounded-xl bg-red-600/10 p-6 text-red-700 dark:text-red-400"
      }
    >
      <span className="text-sm font-medium uppercase tracking-wide">{color === "blue" ? "Синий" : "Красный"}</span>
      <span className="text-center text-2xl font-bold sm:text-3xl">{fighter.name}</span>
      {fighter.club && <span className="text-sm opacity-80">{fighter.club}</span>}
      <span className="font-mono text-6xl font-extrabold tabular-nums sm:text-7xl">{score}</span>
    </div>
  );
}
