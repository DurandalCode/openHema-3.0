"use client";

import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";
import type { TimerStatus } from "@/features/arena-timer/model/timer-authority";
import type { TimerDisplay as TimerDisplayState, UseArenaTimerResult } from "@/features/arena-timer/api/use-arena-timer";
import { TimerDisplay } from "@/features/arena-timer/ui/TimerDisplay";
import type { BoutState } from "@/entities/pool/lib/types";
import { useStartBout } from "@/features/bout-board/api/use-start-bout";
import { toastError } from "@/shared/lib/toast";

/** STATUS_LABEL — короткая подпись статуса таймера в узкой полосе (FR-4). */
const STATUS_LABEL: Record<TimerStatus, string> = {
  STOPPED: "Ожидание",
  RUNNING: "Идёт",
  PAUSED: "Пауза",
  EXPIRED: "Истекло",
};

/**
 * BoutTimerStrip — узкая полоса таймера между половинами бойцов на
 * телефоне (спека 0045, FR-4, T4): заменяет там полную колонку
 * `TimerControls`, оставляя только то, что нужно видеть всегда (раунд,
 * статус, время). Вся полоса, кроме «⋯», — одна область-кнопка
 * старт/пауза (спека 0062, ≥64px): касание в любом месте переключает
 * таймер, вся область окрашена по действию (зелёная «Старт», тёмная «Пауза»). Остальные,
 * редкие, действия (±секунды, смена сторон, отмена, сброс, переоткрытие,
 * следующий бой, табло) живут в листе «⋯» (`BoutActionsSheetContent`, T5) —
 * этот компонент не знает о них, лист приходит снаружи как `children`,
 * рендерящиеся внутри `SheetContent` только когда лист открыт.
 */
export function BoutTimerStrip({
  arenaId,
  poolId,
  boutState,
  roundNumber,
  display,
  controls,
  children,
}: {
  arenaId: string;
  poolId: string | null;
  boutState: BoutState;
  roundNumber: number | null;
  display: TimerDisplayState;
  controls: UseArenaTimerResult["controls"];
  children: ReactNode;
}) {
  const startBout = useStartBout(arenaId);
  const running = display.status === "RUNNING";

  function handleStart() {
    if (boutState === "BOUT_STATE_NOT_STARTED") {
      if (!poolId) return;
      startBout.mutate(poolId, {
        onSuccess: () => controls.start(),
        onError: (error) => toastError(error.message),
      });
      return;
    }
    controls.start();
  }

  return (
    <div className="flex flex-none items-stretch border-y border-border bg-card">
      <button
        type="button"
        aria-label={running ? "Пауза" : "Старт"}
        disabled={!running && startBout.isPending}
        onClick={running ? controls.pause : handleStart}
        className={cn(
          "flex min-h-20 min-w-0 flex-1 touch-manipulation items-center justify-between gap-2 px-3 py-2 text-left text-white active:brightness-90 disabled:opacity-60",
          "[&_[data-timer-status]]:!text-white [&_[data-timer-status][data-alert=endgame]]:!text-amber-300",
          running ? "bg-slate-800" : "bg-emerald-600",
        )}
      >
        <span className="flex min-w-0 flex-col justify-center gap-1">
          <span className="flex items-center gap-2 text-xs font-medium text-white/80">
            {roundNumber !== null && <span className="font-bold tracking-wide whitespace-nowrap">Раунд {roundNumber}</span>}
            <span className="truncate">{STATUS_LABEL[display.status]}</span>
          </span>
          <TimerDisplay status={display.status} remainingCs={display.remainingCs} size="strip" />
        </span>
        <span aria-hidden="true" className="flex flex-none items-center gap-1.5 text-xl font-extrabold">
          <span>{running ? "❚❚" : "▶"}</span>
          <span>{running ? "Пауза" : "Старт"}</span>
        </span>
      </button>
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" size="icon" variant="outline" className="h-auto w-12 flex-none self-stretch rounded-none border-y-0 border-r-0" aria-label="Дополнительные действия">
            <span aria-hidden="true">⋯</span>
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Действия</SheetTitle>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    </div>
  );
}
