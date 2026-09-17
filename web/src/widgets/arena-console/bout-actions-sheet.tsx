"use client";

import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import type { BoardBout } from "@/entities/pool/lib/types";
import type { UseArenaTimerResult } from "@/features/arena-timer/api/use-arena-timer";
import { ADJUST_STEPS } from "@/features/arena-timer/lib/steps";
import { useSwapSides } from "@/features/arena-timer/api/use-swap-sides";
import { TimerSourceNote } from "@/features/arena-timer/ui/timer-source-note";
import type { ScoreboardRoomDto } from "@/entities/arena-live/lib/types";

/**
 * BoutActionsSheetContent — содержимое листа дополнительных действий
 * телефонного «Ведения боя» (спека 0045, FR-5/T5): собирает всё, что на
 * десктопе разбросано по колонке таймера (`TimerControls`) и нижней строке
 * действий `BoutPanelView` — предпросмотр следующего боя, ±секунды, смену
 * сторон (переиспользует `useSwapSides`, T3) с длительностью площадки,
 * отмену последнего очка, сброс боя, переоткрытие и ссылку на табло.
 * Рендерится внутри `SheetContent`, открываемого из `BoutTimerStrip` (T4).
 *
 * Действия сформулированы через колбэки/флаги (`onUndo`/`canReset`/…), а не
 * доменные хуки напрямую — вызывающий (`BoutPanelView`) уже владеет
 * `scoreControl`/`useResetBout`/`useReopenBout`, этот компонент их не
 * дублирует.
 */
export function BoutActionsSheetContent({
  arenaId,
  upNext,
  controls,
  sidesSwapped,
  defaultDurationSeconds,
  room,
  undoLabel,
  onUndo,
  canReset,
  onReset,
  canReopen,
  onReopen,
}: {
  arenaId: string;
  upNext: BoardBout | null;
  controls: UseArenaTimerResult["controls"];
  sidesSwapped: boolean;
  defaultDurationSeconds: number | null;
  /** Состав комнаты — только чтобы показать «таймер идёт на этом экране»,
   *  когда табло не подключено (см. TimerSourceNote). */
  room: ScoreboardRoomDto | null | undefined;
  undoLabel: string | null;
  onUndo: () => void;
  canReset: boolean;
  onReset: () => void;
  canReopen: boolean;
  onReopen: () => void;
}) {
  const setSides = useSwapSides(arenaId);

  return (
    <Col gap={4}>
      <p className="text-sm text-muted-foreground">
        {upNext ? `Далее: ${upNext.fighterA.name} — ${upNext.fighterB.name}` : "Последний бой пула"}
      </p>

      <Row gap={1} className="flex-wrap">
        {ADJUST_STEPS.map((n) => (
          <Button
            key={`minus-${n}`}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => controls.adjust(-n)}
          >
            −{n}с
          </Button>
        ))}
        {ADJUST_STEPS.map((n) => (
          <Button
            key={`plus-${n}`}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => controls.adjust(n)}
          >
            +{n}с
          </Button>
        ))}
      </Row>

      <Row gap={2} align="center" className="flex-wrap">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={setSides.isPending}
          onClick={() => setSides.mutate(!sidesSwapped)}
        >
          {sidesSwapped ? "Вернуть стороны" : "Поменять стороны"}
        </Button>
        {defaultDurationSeconds !== null && (
          <span className="text-sm text-muted-foreground">
            Длительность: {defaultDurationSeconds}с
          </span>
        )}
        <TimerSourceNote room={room} />
      </Row>

      <Row gap={2} className="flex-wrap">
        {undoLabel && (
          <Button type="button" size="sm" variant="ghost" onClick={onUndo}>
            {undoLabel}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={!canReset} onClick={onReset}>
          Сбросить бой
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canReopen}
          title={canReopen ? undefined : "Бой ещё не завершён"}
          onClick={onReopen}
        >
          Переоткрыть
        </Button>
      </Row>

      <Button type="button" variant="outline" asChild>
        <Link href={`/admin/arenas/${arenaId}/scoreboard`} target="_blank">
          Открыть табло
        </Link>
      </Button>
    </Col>
  );
}
