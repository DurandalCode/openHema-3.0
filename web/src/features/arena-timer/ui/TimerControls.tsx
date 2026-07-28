"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Col, Row } from "@/shared/ui/stack";
import { useArenaLive } from "@/features/arena-live/api/use-arena-live";
import { useArenaTimer } from "@/features/arena-timer/api/use-arena-timer";
import { useStartBout } from "@/features/bout-board/api/use-start-bout";
import { TimerDisplay } from "./TimerDisplay";

const ADJUST_STEPS = [1, 2, 3, 5] as const;

async function putDefaultDuration(arenaId: string, seconds: number): Promise<void> {
  await fetch(`/api/admin/arenas/${encodeURIComponent(arenaId)}/default-duration`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ defaultDurationSeconds: seconds }),
  });
}

async function postScoreboardSides(arenaId: string, swapped: boolean): Promise<void> {
  await fetch(`/api/arenas/${encodeURIComponent(arenaId)}/scoreboard-sides`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ swapped }),
  });
}

/**
 * TimerControls — панель управления таймером (спека 0015, FR-7/FR-8/FR-6):
 * старт/пауза/сброс/±1·2·3·5с, дефолтная длительность (персист) и swap
 * синий/красный (эфемерно). Самодостаточна: держит собственные
 * `useArenaLive(role="panel")` + `useArenaTimer` (панель — ведомый показ,
 * ADR 0013), поэтому встраивается одной строкой `<TimerControls arenaId />`.
 * Команды доступны панели независимо от того, открыто ли табло-источник
 * (сервер лишь реле — риск «нет табло» описан в plan.md).
 *
 * «Старт» совмещает два независимых действия одной кнопкой (UX-решение,
 * не доменное): если текущий бой пула ещё не начат — сначала начинает его
 * (`useStartBout`, спека 0013, FR-4), затем в любом случае стартует таймер.
 * Отдельной кнопки «Начать бой» на панели больше нет (перенесена сюда из
 * `BoutBoard`). Пока таймер идёт — «Старт» заблокирован (повторный клик
 * бессмыслен, таймер уже отсчитывает).
 */
export function TimerControls({ arenaId }: { arenaId: string }) {
  const live = useArenaLive(arenaId, "panel", null);
  const { display, controls } = useArenaTimer(arenaId, live);
  const startBout = useStartBout(arenaId);

  const board = live.snapshot?.board ?? null;
  const currentBout = board ? (board.bouts.find((b) => b.id === board.currentBoutId) ?? null) : null;
  const poolId = board?.pool?.id ?? null;

  function handleStart() {
    if (poolId && currentBout?.state === "BOUT_STATE_NOT_STARTED") {
      startBout.mutate(poolId);
    }
    controls.start();
  }

  const defaultDurationSeconds = live.snapshot?.defaultDurationSeconds ?? 90;
  const sidesSwapped = live.snapshot?.room.sidesSwapped ?? false;

  const [durationInput, setDurationInput] = useState(String(defaultDurationSeconds));
  useEffect(() => {
    setDurationInput(String(defaultDurationSeconds));
  }, [defaultDurationSeconds]);

  const setDefaultDuration = useMutation({
    mutationFn: (seconds: number) => putDefaultDuration(arenaId, seconds),
  });
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

      <Row gap={2} align="center">
        <span className="text-sm text-muted-foreground">Дефолт (с):</span>
        <Input
          type="number"
          min={1}
          max={3600}
          value={durationInput}
          onChange={(e) => setDurationInput(e.target.value)}
          className="w-24"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={setDefaultDuration.isPending}
          onClick={() => {
            const n = Number(durationInput);
            if (Number.isFinite(n) && n >= 1 && n <= 3600) {
              setDefaultDuration.mutate(Math.trunc(n));
            }
          }}
        >
          Задать
        </Button>
      </Row>

      <Row gap={2} align="center">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={setSides.isPending}
          onClick={() => setSides.mutate(!sidesSwapped)}
        >
          {sidesSwapped ? "Вернуть стороны" : "Поменять стороны"}
        </Button>
      </Row>
    </Col>
  );
}
