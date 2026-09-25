"use client";

import { useEffect } from "react";
import { cn } from "@/shared/lib/cn";
import { boutNumber, nextBout, sideColorOfFighterA } from "@/entities/arena-live/lib/types";
import type { FighterRef } from "@/entities/pool/lib/types";
import type { UseArenaLiveResult } from "@/features/arena-live/api/use-arena-live";
import type { TimerDisplay as TimerDisplayState, UseArenaTimerResult } from "@/features/arena-timer/api/use-arena-timer";
import { TimerControls } from "@/features/arena-timer/ui/TimerControls";
import { useFinishBout } from "@/features/bout-board/api/use-finish-bout";
import { useRevealBout } from "@/features/bout-board/api/use-reveal-bout";
import { useReopenBout } from "@/features/bout-board/api/use-reopen-bout";
import { useResetBout } from "@/features/bout-board/api/use-reset-bout";
import { toastError } from "@/shared/lib/toast";
import { BoutActionsSheetContent } from "./bout-actions-sheet";
import { BoutTimerStrip } from "./bout-timer-strip";
import { useBoutScoreControl } from "./use-bout-score-control";

const STEPS_MAIN = [1, 2, 3, 5] as const;
const STEPS_SECONDARY = [1, 2, 3, 5] as const;

/**
 * BoutPanelView — режим «Ведение боя» (спека 0033, FR-15..FR-22): две
 * сплошные цветные половины под большой палец, колонка таймера между ними,
 * нижняя строка действий. Единственное на странице место, где кнопки счёта
 * специально увеличены под касание (FR-16: `+N` — основные, ≥64px;
 * `−N` — вспомогательные, ≥48px) — раз здесь секретарь вводит очки во время
 * реального боя, а не настраивает площадку с мышью за столом, как в
 * `ManagementView`. Кнопки таймера/сессии (старт/пауза/±с) сознательно
 * переиспользуют уже собранную `TimerControls` в её обычном (не увеличенном)
 * виде — они реже нажимаются и ошибка в них не портит счёт, в отличие от
 * кнопок очков.
 */
export function BoutPanelView({
  arenaId,
  arenaName,
  live,
  display,
  controls,
  offline,
  onReturnToManagement,
}: {
  arenaId: string;
  arenaName: string;
  live: UseArenaLiveResult;
  display: TimerDisplayState;
  controls: UseArenaTimerResult["controls"];
  offline: boolean;
  /**
   * onReturnToManagement — переключает страницу в режим «Управление
   * ареной» (спека 0045, FR-2). Один и тот же колбэк (`setMode
   * ("management")` в `ArenaConsole`) отвечает и за автовозврат по
   * завершении пула (AC-9/FR-21, спека 0033), и за ручной тап по кнопке
   * возврата в компактной мобильной шапке (AC-3, спека 0045) — оба случая
   * означают одно и то же действие, отдельного колбэка не заводим.
   */
  onReturnToManagement: () => void;
}) {
  const board = live.snapshot?.board ?? null;
  const finish = useFinishBout(arenaId);
  const reveal = useRevealBout(arenaId);
  const reopen = useReopenBout(arenaId);
  const reset = useResetBout(arenaId);

  const pool = board?.pool ?? null;
  const currentBout = board ? (board.bouts.find((b) => b.id === board.currentBoutId) ?? null) : null;

  const scoreControl = useBoutScoreControl({
    arenaId,
    poolId: pool?.id ?? null,
    boutId: currentBout?.id ?? null,
    serverScoreA: currentBout?.scoreA ?? 0,
    serverScoreB: currentBout?.scoreB ?? 0,
    offline,
  });

  const canFinish = !offline && currentBout?.state === "BOUT_STATE_IN_PROGRESS";

  // FR-22: Ctrl+Enter — завершить бой; Пробел — пуск/пауза таймера. Esc
  // (возврат в управление) обрабатывает `ArenaConsole` — общий для обоих
  // равнозначных путей назад (FR-3), не дублируется здесь.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;

      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (canFinish && pool) finish.mutate(pool.id, { onError: (err) => toastError(err.message) });
        return;
      }
      if (e.key === " " || e.code === "Space") {
        // Space belongs to the focused control, or to an open modal dialog.
        // Let the browser activate that control instead of starting the timer.
        if (
          document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"], dialog[open]') ||
          target?.closest('button, select, summary, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])')
        ) return;
        e.preventDefault();
        if (display.status === "RUNNING") controls.pause();
        else controls.start();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canFinish, pool, finish, display.status, controls]);

  // FR-21/AC-9: завершение последнего непроведённого боя пула возвращает в
  // режим управления автоматически.
  useEffect(() => {
    if (!board?.pool || board.bouts.length === 0) return;
    const allFinished = board.bouts.every((b) => b.state === "BOUT_STATE_FINISHED");
    if (allFinished) onReturnToManagement();
  }, [board, onReturnToManagement]);

  if (!board?.pool || !currentBout) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Пул не стоит — вести нечего.
      </div>
    );
  }

  const sidesSwapped = live.snapshot?.room.sidesSwapped ?? false;
  const redFighter = sideColorOfFighterA(sidesSwapped) === "red" ? currentBout.fighterA : currentBout.fighterB;
  const redScore = sideColorOfFighterA(sidesSwapped) === "red" ? scoreControl.scoreA : scoreControl.scoreB;
  const blueFighter = sideColorOfFighterA(sidesSwapped) === "red" ? currentBout.fighterB : currentBout.fighterA;
  const blueScore = sideColorOfFighterA(sidesSwapped) === "red" ? scoreControl.scoreB : scoreControl.scoreA;
  const redSide: "A" | "B" = sideColorOfFighterA(sidesSwapped) === "red" ? "A" : "B";
  const blueSide: "A" | "B" = redSide === "A" ? "B" : "A";
  const canScore = currentBout.state === "BOUT_STATE_IN_PROGRESS";
  const num = boutNumber(board);
  const upNext = nextBout(board);
  // Общие для нижней строки (десктоп/планшет) и листа «⋯» (телефон, T5)
  // условия — одна и та же доменная логика, не дублируется под каждый вид.
  const canReset = currentBout.state === "BOUT_STATE_IN_PROGRESS";
  const canReopen = currentBout.state === "BOUT_STATE_FINISHED";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        Компактная мобильная шапка (спека 0045, FR-1/FR-2/AC-3): на md:hidden
        заменяет собой два ряда десктопной шапки страницы площадки
        (`PageHeader` + подшапка режима, скрытые `ArenaConsole` на этой
        ширине в режиме `bout`) одной строкой — кнопка возврата с названием
        площадки, номер боя в пуле, индикатор офлайна.
      */}
      <div
        data-testid="mobile-bout-header"
        className="flex flex-none items-center gap-2 border-b border-border bg-card px-3 py-2 md:hidden"
      >
        <button
          type="button"
          onClick={onReturnToManagement}
          className="flex min-w-0 items-center gap-1 text-sm font-medium text-foreground"
        >
          <span aria-hidden="true">‹</span>
          <span className="truncate">{arenaName || "Арена"}</span>
        </button>
        {num && (
          <span className="flex-none text-xs text-muted-foreground">
            Бой {num.current} из {num.total}
          </span>
        )}
        {offline && (
          <span className="ml-auto flex-none rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            Офлайн
          </span>
        )}
      </div>

      {scoreControl.pendingNotice && (
        <p className="flex-none bg-amber-500/10 px-3 py-1 text-center text-xs text-amber-700 dark:text-amber-400">
          {scoreControl.pendingNotice}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <FighterHalf
          color="red"
          fighter={redFighter}
          score={redScore}
          disabled={!canScore}
          onStep={(delta) => scoreControl.step(redSide, delta, "красному")}
        />

        {/*
          Полоса таймера на телефоне (спека 0045, FR-4/T7): узкая
          `BoutTimerStrip` вместо полной колонки `TimerControls` — вмещает
          только раунд/статус/время/старт-паузу, редкие действия — в её
          листе «⋯» (`BoutActionsSheetContent`, T5), сюда переданном как
          `children`.
        */}
        <div className="w-full flex-none md:hidden">
          <BoutTimerStrip
            arenaId={arenaId}
            poolId={pool?.id ?? null}
            boutState={currentBout.state}
            roundNumber={currentBout.roundNumber}
            display={display}
            controls={controls}
          >
            <BoutActionsSheetContent
              arenaId={arenaId}
              upNext={upNext}
              controls={controls}
              sidesSwapped={sidesSwapped}
              defaultDurationSeconds={live.snapshot?.defaultDurationSeconds ?? null}
              room={live.snapshot?.room}
              undoLabel={scoreControl.undoLabel}
              onUndo={scoreControl.undoLastStep}
              canReset={canReset}
              onReset={() => pool && reset.mutate(pool.id, { onError: (err) => toastError(err.message) })}
              canReopen={canReopen}
              onReopen={() => pool && reopen.mutate(pool.id, { onError: (err) => toastError(err.message) })}
            />
          </BoutTimerStrip>
        </div>

        {/* Полная колонка таймера — планшет и шире (FR-8/FR-9/FR-10), без изменений в логике. */}
        <div className="hidden w-full flex-none overflow-y-auto border-y border-border bg-card p-4 md:block md:w-[300px] md:border-x md:border-y-0">
          <TimerControls arenaId={arenaId} live={live} display={display} controls={controls} />
        </div>

        <FighterHalf
          color="blue"
          fighter={blueFighter}
          score={blueScore}
          disabled={!canScore}
          onStep={(delta) => scoreControl.step(blueSide, delta, "синему")}
        />
      </div>

      {/*
        Мобильная нижняя строка (спека 0045, FR-6/T8): только два основных
        действия — остальные (отмена/сброс/переоткрытие) переехали в лист
        «⋯» (`BoutActionsSheetContent`, T5), открываемый из `BoutTimerStrip`
        (T4) выше. Одни и те же мутации (`reveal`/`finish`), что и в
        десктопной строке ниже — не дублируются, дублируется только разметка
        кнопок под два разных набора видимости.
      */}
      <div
        data-testid="mobile-bottom-actions"
        className="flex flex-none items-center gap-2 border-t border-border bg-card p-2 md:hidden"
      >
        <button
          type="button"
          onClick={() => reveal.mutate(undefined, { onError: (err) => toastError(err.message) })}
          className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Показать следующий
        </button>
        <button
          type="button"
          disabled={!canFinish}
          onClick={() => pool && finish.mutate(pool.id, { onError: (err) => toastError(err.message) })}
          className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          Завершить бой
        </button>
      </div>

      {/* Десктопная/планшетная нижняя строка — полный состав, без изменений (FR-8/FR-9). */}
      <div
        data-testid="desktop-bottom-actions"
        className="hidden flex-none flex-wrap items-center gap-2 border-t border-border bg-card p-2 md:flex"
      >
        {scoreControl.undoLabel && (
          <button
            type="button"
            onClick={scoreControl.undoLastStep}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            {scoreControl.undoLabel}
          </button>
        )}
        <button
          type="button"
          disabled={!canReset}
          onClick={() => pool && reset.mutate(pool.id, { onError: (err) => toastError(err.message) })}
          className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          Сбросить бой
        </button>
        <button
          type="button"
          disabled={!canReopen}
          title={canReopen ? undefined : "Бой ещё не завершён"}
          onClick={() => pool && reopen.mutate(pool.id, { onError: (err) => toastError(err.message) })}
          className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          Переоткрыть
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {upNext ? `Далее: ${upNext.fighterA.name} — ${upNext.fighterB.name}` : "Последний бой пула"}
        </span>
        <button
          type="button"
          onClick={() => reveal.mutate(undefined, { onError: (err) => toastError(err.message) })}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Показать следующий
        </button>
        <button
          type="button"
          disabled={!canFinish}
          onClick={() => pool && finish.mutate(pool.id, { onError: (err) => toastError(err.message) })}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          Завершить бой
        </button>
      </div>

      <p className="flex-none px-2 py-1 text-center text-[11px] text-muted-foreground">
        {num ? `Бой ${num.current} из ${num.total} · ` : ""}Ctrl+Enter — завершить · пробел — пауза таймера
      </p>
    </div>
  );
}

function FighterHalf({
  color,
  fighter,
  score,
  disabled,
  onStep,
}: {
  color: "red" | "blue";
  fighter: FighterRef;
  score: number;
  disabled: boolean;
  onStep: (delta: number) => void;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col text-white",
        color === "red" ? "bg-red-600" : "bg-blue-600",
      )}
    >
      <div className="flex flex-col gap-1 p-4">
        <span className="text-xs font-bold tracking-[0.2em] text-white/70">
          {color === "red" ? "КРАСНЫЙ" : "СИНИЙ"}
        </span>
        <span className="truncate text-xl font-bold">{fighter.name}</span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <span className="font-mono text-7xl font-black tabular-nums sm:text-8xl">{score}</span>
      </div>
      <div className="grid grid-cols-4 gap-0.5 p-0.5">
        {STEPS_MAIN.map((n) => (
          <button
            key={`p${n}`}
            type="button"
            disabled={disabled}
            onClick={() => onStep(n)}
            className="h-16 bg-black/20 text-2xl font-extrabold hover:bg-black/10 disabled:opacity-40 md:h-[84px]"
          >
            +{n}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-0.5 p-0.5 pb-2">
        {STEPS_SECONDARY.map((n) => (
          <button
            key={`m${n}`}
            type="button"
            disabled={disabled}
            onClick={() => onStep(-n)}
            className="h-12 bg-black/10 text-lg font-bold hover:bg-black/20 disabled:opacity-40 md:h-[52px]"
          >
            −{n}
          </button>
        ))}
      </div>
    </div>
  );
}
