"use client";

import { useMutation } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { Col, Row } from "@/shared/ui/stack";
import type { UseArenaLiveResult } from "@/features/arena-live/api/use-arena-live";
import type { TimerDisplay as TimerDisplayState, UseArenaTimerResult } from "@/features/arena-timer/api/use-arena-timer";
import { useStartBout } from "@/features/bout-board/api/use-start-bout";
import { TimerDisplay } from "./TimerDisplay";

const ADJUST_STEPS = [1, 2, 3, 5] as const;

async function postScoreboardSides(arenaId: string, swapped: boolean): Promise<void> {
  await fetch(`/api/arenas/${encodeURIComponent(arenaId)}/scoreboard-sides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ swapped }),
  });
}

/**
 * TimerControls — колонка таймера панели секретаря (спека 0033, FR-17,
 * поверх спеки 0015 FR-7/FR-8/FR-6): значение с сотыми, старт/пауза/сброс,
 * ±1·2·3·5с, смена сторон и дефолтная длительность площадки **только на
 * чтение** — правится в модалке правки площади на `/admin/arenas`, не здесь
 * (спека 0027, FR-13).
 *
 * `live`/`display`/`controls` приходят **пропами**, не создаются внутри
 * (спека 0033, plan.md «Композиция страницы площадки»): `widgets/
 * arena-console` — единственный владелец живого канала И таймера на
 * странице (один `useArenaLive` + один `useArenaTimer`), чтобы
 * переключение режимов управление/панель не плодило вторые подключения/
 * rAF-циклы, а `BoutPanelView` могла делить те же `display`/`controls` для
 * клавиатурных сочетаний (FR-22, Пробел = пуск/пауза), не вызывая
 * `useArenaTimer` повторно.
 *
 * «Старт» совмещает два независимых действия одной кнопкой (UX-решение,
 * не доменное): если текущий бой пула ещё не начат — сначала начинает его
 * (`useStartBout`, спека 0013, FR-4), затем в любом случае стартует таймер.
 * Пока таймер идёт — «Старт» заблокирован.
 */
export function TimerControls({
  arenaId,
  live,
  display,
  controls,
}: {
  arenaId: string;
  live: UseArenaLiveResult;
  display: TimerDisplayState;
  controls: UseArenaTimerResult["controls"];
}) {
  const startBout = useStartBout(arenaId);

  const board = live.snapshot?.board ?? null;
  const currentBout = board ? (board.bouts.find((b) => b.id === board.currentBoutId) ?? null) : null;
  const poolId = board?.pool?.id ?? null;
  const defaultDurationSeconds = live.snapshot?.defaultDurationSeconds ?? null;

  function handleStart() {
    if (poolId && currentBout?.state === "BOUT_STATE_NOT_STARTED") {
      startBout.mutate(poolId);
    }
    controls.start();
  }

  const sidesSwapped = live.snapshot?.room.sidesSwapped ?? false;

  const setSides = useMutation({
    mutationFn: (swapped: boolean) => postScoreboardSides(arenaId, swapped),
  });

  return (
    <Col gap={4}>
      <TimerDisplay status={display.status} remainingCs={display.remainingCs} />

      <Row gap={2} className="flex-wrap">
        <Button
          type="button"
          size="sm"
          disabled={display.status === "RUNNING" || startBout.isPending}
          onClick={handleStart}
        >
          Старт
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={controls.pause}>
          Пауза
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={controls.reset}>
          Сброс
        </Button>
      </Row>

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
      </Row>
    </Col>
  );
}
