"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/cn";
import { useArenaLive } from "@/features/arena-live/api/use-arena-live";
import { useArenaTimer } from "@/features/arena-timer/api/use-arena-timer";
import { TimerDisplay, type TimerAlertKind } from "@/features/arena-timer/ui/TimerDisplay";
import type { TimerStatus } from "@/features/arena-timer/model/timer-authority";
import { nextBout, boutNumber, outcomeOf, sideColorOfFighterA } from "@/entities/arena-live/lib/types";
import type { Color, TimerStatusDto } from "@/entities/arena-live/lib/types";
import { scoreboardPhase, type ScoreboardPhase } from "@/entities/arena-live/lib/scoreboard-phase";
import type { BoutBoard as BoutBoardDto, FighterRef } from "@/entities/pool/lib/types";
import { AppearanceToggle, useScoreboardAppearance } from "./appearance-toggle";

// useArenaTimer отдаёт клиентский `TimerStatus` ("STOPPED"/"RUNNING"/...), а
// `scoreboardPhase` (T9) принимает proto-зеркальный `TimerStatusDto`
// ("TIMER_STATUS_..."). Локальная карта — табло не трогает
// `features/arena-timer/api/use-arena-timer.ts` (вне трека E, дизъюнктный
// файл), поэтому не переиспользует его внутренний (неэкспортированный)
// маппинг, а держит свой.
const TIMER_STATUS_TO_DTO: Record<TimerStatus, TimerStatusDto> = {
  STOPPED: "TIMER_STATUS_STOPPED",
  RUNNING: "TIMER_STATUS_RUNNING",
  PAUSED: "TIMER_STATUS_PAUSED",
  EXPIRED: "TIMER_STATUS_EXPIRED",
};

/**
 * ArenaScoreboard — полноэкранное табло арены (спека 0015, перестроено
 * спекой 0033): полоса таймера — верхняя и самая крупная (FR-28/AC-14),
 * пять фаз вместо двух с половиной (FR-29, `scoreboardPhase`), собственный
 * тумблер оформления (FR-31/AC-18). Read-only (FR-17/FR-32) — из
 * интерактивных элементов только тумблер оформления, и он не меняет ни
 * доменного, ни живого состояния.
 *
 * Корневой `fixed inset-0 z-50` перекрывает родительский chrome (Navbar/
 * AdminNav) на весь просмотр без второго root layout (см. поправку к плану —
 * Next.js App Router не даёт снять родительский layout, а второй root
 * потребовал бы убрать общий `app/layout.tsx`).
 *
 * **Табло — намеренное исключение из дизайн-системы** (NFR-2, «читаемость
 * с расстояния»): в отличие от остального приложения оно НЕ наследует тему
 * (`bg-background`/`text-foreground`/`dark:`/CSS-переменные) — обе палитры
 * (тёмная/светлая) захардкожены прямо здесь, независимо от системной/
 * локальной темы приложения (`next-themes`) зрителя или админа. Переключает
 * их только собственный тумблер табло (FR-31), а не тема приложения.
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
  const [appearance] = useScoreboardAppearance(arenaId);
  const isLight = appearance === "light";
  const snapshot = live.snapshot;
  const board = snapshot?.board ?? null;
  const room = snapshot?.room ?? {
    scoreboardCount: 0,
    thisOrdinal: 0,
    thisIsSource: false,
    sidesSwapped: false,
    revealGeneration: 0,
  };

  // Оглашение результата (спека 0015, FR-14/AC-11a/AC-11b): сервер
  // авто-продвигает `currentBoutId` на следующий бой СРАЗУ по завершении
  // (0013, FinishCurrentBout) — тот же снапшот уже несёт новый
  // `currentBoutId`. Табло не полагается на «currentBoutId изменился» как
  // сигнал перехода (он меняется мгновенно) — держит показ только что
  // завершённого боя, пока секретарь явно не покажет следующий (см.
  // `room.revealGeneration` ниже) либо не начнёт/не выберет следующий сам
  // (следующий бой становится не NOT_STARTED, либо currentBoutId
  // переключается ещё раз на третий бой — циркуляция, оставлено как
  // фолбэк на случай, если секретарь пропустит кнопку показа).
  //
  // Вся логика решения живёт в теле эффекта, читая/записывая
  // `displayedBoutIdRef`/`advanceTargetRef` напрямую, а не в функции-апдейтере
  // `setState(prev => ...)`: апдейтеры React обязаны быть чистыми и в dev
  // (React 18 Strict Mode) вызываются дважды для проверки этого — апдейтер с
  // побочным эффектом (мутация `advanceTargetRef` внутри него) на второй
  // вызов видел уже изменённый на первом вызове реф и повторно включал
  // «удержание» сразу после его снятия, из-за чего циркуляция на другой
  // ещё не начатый бой после завершения никогда не показывалась на табло.
  const [displayedBoutId, setDisplayedBoutId] = useState<string | null>(board?.currentBoutId || null);
  const displayedBoutIdRef = useRef<string | null>(board?.currentBoutId || null);
  const advanceTargetRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const revealGenerationRef = useRef(room.revealGeneration);

  useEffect(() => {
    const rawCurrentId = board?.currentBoutId || null;

    if (!initializedRef.current) {
      initializedRef.current = true;
      displayedBoutIdRef.current = rawCurrentId;
      revealGenerationRef.current = room.revealGeneration;
      setDisplayedBoutId(rawCurrentId);
      return;
    }

    // RevealCurrentBout (спека 0015, UX-уточнение): секретарь явно нажал
    // «Показать следующий бой» на панели. Развязывает «оглашение результата»
    // и «переход к следующему бою на табло» на разные действия — снимает
    // удержание безусловно, независимо от состояния текущего боя (даже если
    // он ещё «не начат»), что и даёт видимое «0:0, ожидание старта» перед
    // стартом, а не мгновенный скачок в «идёт» одним и тем же кликом Старт.
    const revealed = room.revealGeneration !== revealGenerationRef.current;
    revealGenerationRef.current = room.revealGeneration;
    if (revealed) {
      advanceTargetRef.current = null;
      displayedBoutIdRef.current = rawCurrentId;
      setDisplayedBoutId(rawCurrentId);
      return;
    }

    const prevDisplayed = displayedBoutIdRef.current;
    if (rawCurrentId === prevDisplayed) return;

    const displayedState = board?.bouts.find((b) => b.id === prevDisplayed)?.state;
    const isHoldingAnnouncement = displayedState === "BOUT_STATE_FINISHED";

    let next = rawCurrentId;
    if (isHoldingAnnouncement && advanceTargetRef.current === null) {
      advanceTargetRef.current = rawCurrentId;
      next = prevDisplayed;
    } else if (advanceTargetRef.current !== null) {
      if (rawCurrentId !== advanceTargetRef.current) {
        advanceTargetRef.current = null;
        next = rawCurrentId;
      } else {
        const candidate = board?.bouts.find((b) => b.id === rawCurrentId);
        next = candidate && candidate.state !== "BOUT_STATE_NOT_STARTED" ? rawCurrentId : prevDisplayed;
        if (next === rawCurrentId) advanceTargetRef.current = null;
      }
    }

    displayedBoutIdRef.current = next;
    setDisplayedBoutId(next);
  }, [board?.currentBoutId, board?.bouts, room.revealGeneration]);

  const timerStatusDto = TIMER_STATUS_TO_DTO[display.status];
  const phase = scoreboardPhase({
    board,
    displayedBoutId,
    timerStatus: timerStatusDto,
    remainingCs: display.remainingCs,
  });

  if (phase === "idle") {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 flex flex-col items-center justify-center gap-6",
          isLight ? "bg-white text-black" : "bg-black text-white",
        )}
      >
        <AppearanceToggle arenaId={arenaId} />
        <p className={cn("text-3xl sm:text-4xl", isLight ? "text-gray-500" : "text-gray-400")}>
          {arenaName || "Табло"}
        </p>
        <p className="text-6xl font-black sm:text-7xl">Ожидание боя…</p>
      </div>
    );
  }

  // phase !== "idle" гарантирует (scoreboardPhase, T9) board/board.pool и
  // displayedBout непустыми — но TS об этом не знает, поэтому `!`.
  const displayedBout = board!.bouts.find((b) => b.id === displayedBoutId)!;
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
      ? sideColorOfFighterA(room.sidesSwapped)
      : outcome === "B"
        ? sideColorOfFighterA(room.sidesSwapped) === "blue"
          ? "red"
          : "blue"
        : null;
  const outcomeLabel =
    outcome === "draw" ? "Ничья" : outcome === "A" ? displayedBout.fighterA.name : outcome === "B" ? displayedBout.fighterB.name : null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto p-6 sm:p-10",
        isLight ? "bg-white text-black" : "bg-black text-white",
      )}
    >
      <AppearanceToggle arenaId={arenaId} />

      <header className="flex flex-col items-center gap-1 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">{arenaName || "Табло"}</h1>
          <p className={cn("text-lg sm:text-xl", isLight ? "text-gray-600" : "text-gray-300")}>
            {board!.pool!.nominationName}
            {board!.pool!.name ? ` · ${board!.pool!.name}` : ""}
          </p>
        </div>
        {number && (
          <p className={cn("text-lg sm:text-xl", isLight ? "text-gray-500" : "text-gray-400")}>
            Бой {number.current} из {number.total}
          </p>
        )}
      </header>

      <TimerStrip phase={phase} status={display.status} remainingCs={display.remainingCs} />

      <div className="grid flex-1 grid-cols-1 items-center gap-6 sm:grid-cols-2">
        <FighterPanel color="blue" fighter={blueFighter} score={blueScore} />
        <FighterPanel color="red" fighter={redFighter} score={redScore} />
      </div>

      {finished && outcomeLabel && (
        <div
          data-testid="outcome-announcement"
          className={cn(
            "rounded-lg p-6 text-center text-5xl font-black sm:text-6xl",
            outcomeColor === "blue"
              ? "bg-blue-600 text-white"
              : outcomeColor === "red"
                ? "bg-red-600 text-white"
                : "bg-white text-black",
          )}
        >
          {outcome === "draw" ? "Ничья" : `Победа: ${outcomeLabel}`}
        </div>
      )}

      <footer className={cn("text-center text-2xl sm:text-3xl", isLight ? "text-gray-600" : "text-gray-300")}>
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

/** PHASE_LABEL — подпись фазы над таймером (FR-29: «ИДЁТ»/«ОЖИДАНИЕ СТАРТА»/«ВРЕМЯ ВЫШЛО»). */
const PHASE_LABEL: Partial<Record<ScoreboardPhase, string>> = {
  waiting: "ОЖИДАНИЕ СТАРТА",
  running: "ИДЁТ",
  endgame: "КОНЦОВКА",
  expired: "ВРЕМЯ ВЫШЛО",
};

/**
 * TimerStrip — верхняя полоса табло (спека 0033, FR-28/AC-14): занимает
 * заметно больше пространства и рисует время крупнее счёта
 * (`TimerDisplay size="scoreboard"` — 7/10/13rem против 6/8/10rem у счёта
 * бойца). Держит собственный тёмный фон вне зависимости от тумблера
 * оформления табло (FR-31) — цифровой блок таймера как «инструментальная
 * панель» должен оставаться контрастным и в светлой палитре, поэтому
 * тумблер меняет только окружающую «раму» экрана (шапку/футер/фон), не сам
 * индикатор времени. Пять фаз рисуются по `scoreboardPhase` (T9): "idle"
 * сюда не долетает — родитель отрисовывает для него отдельный экран.
 * `motion-safe:` вместо голого `animate-pulse` — NFR-4 (prefers-reduced-motion).
 */
function TimerStrip({
  phase,
  status,
  remainingCs,
}: {
  phase: ScoreboardPhase;
  status: TimerStatus;
  remainingCs: number;
}) {
  const alert: TimerAlertKind | null = phase === "expired" ? "expired" : phase === "endgame" ? "endgame" : null;
  const label = PHASE_LABEL[phase] ?? null;

  return (
    <div
      data-testid="timer-strip"
      data-phase={phase}
      className={cn(
        "flex min-h-[32vh] flex-col items-center justify-center gap-3 rounded-2xl bg-neutral-950 py-8 sm:min-h-[38vh]",
        phase === "expired" && "motion-safe:animate-pulse bg-red-950",
        phase === "endgame" && "bg-amber-950/60",
      )}
    >
      {label && (
        <p
          data-testid="timer-strip-label"
          className={cn(
            "text-xl font-bold tracking-[0.3em] sm:text-2xl",
            phase === "running" && "motion-safe:animate-pulse text-emerald-400",
            phase === "waiting" && "text-gray-400",
            phase === "endgame" && "text-amber-400",
            phase === "expired" && "text-red-400",
          )}
        >
          {label}
        </p>
      )}
      <TimerDisplay status={status} remainingCs={remainingCs} size="scoreboard" alert={alert} />
    </div>
  );
}

function FighterPanel({ color, fighter, score }: { color: Color; fighter: FighterRef; score: number }) {
  return (
    <div
      data-color={color}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl p-6 text-white sm:p-8",
        color === "blue" ? "bg-blue-800" : "bg-red-800",
      )}
    >
      <span className="text-2xl font-bold uppercase tracking-widest sm:text-3xl">
        {color === "blue" ? "Синий" : "Красный"}
      </span>
      <span className="text-center text-4xl font-extrabold sm:text-5xl lg:text-6xl">{fighter.name}</span>
      {fighter.club && <span className="text-lg text-white/80 sm:text-xl">{fighter.club}</span>}
      <span className="font-mono text-[6rem] font-black leading-none tabular-nums sm:text-[8rem] lg:text-[10rem]">
        {score}
      </span>
    </div>
  );
}
