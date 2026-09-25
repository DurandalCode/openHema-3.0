"use client";

import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Row } from "@/shared/ui/stack";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";
import type { TimerStatus } from "@/features/arena-timer/model/timer-authority";
import type { TimerDisplay as TimerDisplayState, UseArenaTimerResult } from "@/features/arena-timer/api/use-arena-timer";
import { TimerDisplay } from "@/features/arena-timer/ui/TimerDisplay";

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
 * статус, время) и одну кнопку переключения старт/пауза. Остальные,
 * редкие, действия (±секунды, смена сторон, отмена, сброс, переоткрытие,
 * следующий бой, табло) живут в листе «⋯» (`BoutActionsSheetContent`, T5) —
 * этот компонент не знает о них, лист приходит снаружи как `children`,
 * рендерящиеся внутри `SheetContent` только когда лист открыт.
 */
export function BoutTimerStrip({
  roundNumber,
  display,
  controls,
  children,
}: {
  roundNumber: number | null;
  display: TimerDisplayState;
  controls: UseArenaTimerResult["controls"];
  children: ReactNode;
}) {
  const running = display.status === "RUNNING";

  return (
    <Row
      align="center"
      justify="between"
      gap={1}
      className="flex-none border-y border-border bg-card px-2 py-1.5 max-[340px]:flex-wrap"
    >
      <Row align="center" gap={1} className="min-w-0 shrink overflow-hidden max-[340px]:w-full max-[340px]:flex-wrap max-[340px]:overflow-visible">
        {roundNumber !== null && (
          <span className="flex-none text-xs font-bold tracking-wide whitespace-nowrap text-muted-foreground">
            Раунд {roundNumber}
          </span>
        )}
        <span className="flex-none truncate text-xs font-medium text-muted-foreground">
          {STATUS_LABEL[display.status]}
        </span>
        <TimerDisplay status={display.status} remainingCs={display.remainingCs} size="strip" />
      </Row>

      <Row align="center" gap={1} className="flex-none max-[340px]:ml-auto">
        <Button type="button" size="sm" onClick={running ? controls.pause : controls.start}>
          {running ? "Пауза" : "Старт"}
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" size="icon" variant="outline" aria-label="Дополнительные действия">
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
      </Row>
    </Row>
  );
}
