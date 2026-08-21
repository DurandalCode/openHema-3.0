"use client";

import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Col, Row } from "@/shared/ui/stack";
import { toastUndo, toastError } from "@/shared/lib/toast";
import {
  boutStateLabel,
  outcomeOf,
  poolStatusLabel,
  type BoardBout,
  type BoutBoard,
} from "@/entities/pool/lib/types";
import type { UseArenaLiveResult } from "@/features/arena-live/api/use-arena-live";
import { PoolSeating } from "@/features/pool-seating/ui/pool-seating";
import { useSeatPool } from "@/features/pool-seating/api/use-seat-pool";
import { useUnseatPool } from "@/features/pool-seating/api/use-unseat-pool";
import { useSetCurrentBout } from "@/features/bout-board/api/use-set-current-bout";
import { useFinishBout } from "@/features/bout-board/api/use-finish-bout";
import { useRevealBout } from "@/features/bout-board/api/use-reveal-bout";
import { useReopenBout } from "@/features/bout-board/api/use-reopen-bout";
import { useResetBout } from "@/features/bout-board/api/use-reset-bout";
import { TimerControls } from "@/features/arena-timer/ui/TimerControls";
import type { TimerDisplay as TimerDisplayState, UseArenaTimerResult } from "@/features/arena-timer/api/use-arena-timer";
import { useBoutScoreControl } from "./use-bout-score-control";

/**
 * ManagementView — режим «Управление ареной» (спека 0033, FR-6..FR-14):
 * площадка свободна → `PoolSeating` (постановка, FR-12..FR-14, уже несёт
 * фильтр по номинации и объясняющее пустое состояние — 0033 T22); пул стоит
 * → двухколоночный экран (слева пул/состав/бои по порядку, справа текущий
 * бой/таймер/действия, FR-6..FR-11).
 */
export function ManagementView({
  arenaId,
  live,
  display,
  controls,
  offline,
  onEnterBoutPanel,
}: {
  arenaId: string;
  live: UseArenaLiveResult;
  display: TimerDisplayState;
  controls: UseArenaTimerResult["controls"];
  offline: boolean;
  /** onEnterBoutPanel — вторая точка входа в панель (спека 0033, FR-4): кнопка
   * «Вести бой в панели» у текущего боя, ведёт в то же место, что переключатель
   * режима в подшапке (`ArenaConsole`/`ModeSwitch`). */
  onEnterBoutPanel: () => void;
}) {
  const board = live.snapshot?.board ?? null;

  if (!board?.pool) {
    return <PoolSeating arenaId={arenaId} />;
  }

  return (
    <SeatedManagement
      arenaId={arenaId}
      board={board}
      live={live}
      display={display}
      controls={controls}
      offline={offline}
      onEnterBoutPanel={onEnterBoutPanel}
    />
  );
}

function SeatedManagement({
  arenaId,
  board,
  live,
  display,
  controls: timerControls,
  offline,
  onEnterBoutPanel,
}: {
  arenaId: string;
  board: BoutBoard;
  live: UseArenaLiveResult;
  display: TimerDisplayState;
  controls: UseArenaTimerResult["controls"];
  offline: boolean;
  onEnterBoutPanel: () => void;
}) {
  const pool = board.pool!;
  const setCurrent = useSetCurrentBout(arenaId);
  const unseat = useUnseatPool(arenaId);
  const seat = useSeatPool(arenaId);
  const finish = useFinishBout(arenaId);
  const reveal = useRevealBout(arenaId);
  const reopen = useReopenBout(arenaId);
  const reset = useResetBout(arenaId);

  const currentBout = board.bouts.find((b) => b.id === board.currentBoutId) ?? null;

  function handleUnseat() {
    const poolId = pool.id;
    unseat.mutate(poolId, {
      onSuccess: () => {
        toastUndo(`Пул «${pool.name}» снят с арены`, {
          onUndo: () => seat.mutate(poolId),
        });
      },
      onError: (err) => toastError(err.message),
    });
  }

  return (
    <Row gap={6} align="start" className="flex-wrap lg:flex-nowrap">
      <Col gap={4} className="w-full lg:w-[380px] lg:flex-none">
        <Card>
          <CardContent className="pt-6">
            <Col gap={3}>
              <Row align="center" justify="between" gap={2} className="flex-wrap">
                <Row align="center" gap={2}>
                  <span className="text-lg font-semibold">{pool.name}</span>
                  <Badge variant="outline">{pool.nominationName}</Badge>
                </Row>
                <Badge>{poolStatusLabel(pool.status)}</Badge>
              </Row>
              <span className="text-sm text-muted-foreground">
                {pool.members.length} бойцов · {board.bouts.length} боёв
              </span>
              <Col gap={1} className="border-t pt-2">
                <span className="text-sm font-medium text-muted-foreground">Состав</span>
                {pool.members.map((f) => (
                  <Row key={f.fighterId} align="center" gap={2} className="text-sm">
                    <span>{f.name}</span>
                    {f.club && <span className="text-xs text-muted-foreground">({f.club})</span>}
                  </Row>
                ))}
              </Col>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={unseat.isPending}
                onClick={handleUnseat}
              >
                Снять пул с арены
              </Button>
            </Col>
          </CardContent>
        </Card>

        <BoutList
          bouts={board.bouts}
          currentBoutId={board.currentBoutId}
          pending={setCurrent.isPending}
          onSelect={(boutId) =>
            setCurrent.mutate(
              { poolId: pool.id, boutId },
              { onError: (err) => toastError(err.message) },
            )
          }
        />
      </Col>

      <Col gap={4} className="flex-1">
        {currentBout ? (
          <CurrentBoutCard
            arenaId={arenaId}
            poolId={pool.id}
            bout={currentBout}
            offline={offline}
            onFinish={() => finish.mutate(pool.id, { onError: (err) => toastError(err.message) })}
            onReveal={() => reveal.mutate(undefined, { onError: (err) => toastError(err.message) })}
            onReopen={() => reopen.mutate(pool.id, { onError: (err) => toastError(err.message) })}
            onReset={() => reset.mutate(pool.id, { onError: (err) => toastError(err.message) })}
            onEnterBoutPanel={onEnterBoutPanel}
          />
        ) : (
          <p className="text-sm text-muted-foreground">У пула нет боёв.</p>
        )}
        <Card>
          <CardContent className="pt-6">
            <TimerControls arenaId={arenaId} live={live} display={display} controls={timerControls} />
          </CardContent>
        </Card>
      </Col>
    </Row>
  );
}

function CurrentBoutCard({
  arenaId,
  poolId,
  bout,
  offline,
  onFinish,
  onReveal,
  onReopen,
  onReset,
  onEnterBoutPanel,
}: {
  arenaId: string;
  poolId: string;
  bout: BoardBout;
  offline: boolean;
  onFinish: () => void;
  onReveal: () => void;
  onReopen: () => void;
  onReset: () => void;
  onEnterBoutPanel: () => void;
}) {
  const scoreControl = useBoutScoreControl({
    arenaId,
    poolId,
    boutId: bout.id,
    serverScoreA: bout.scoreA,
    serverScoreB: bout.scoreB,
    offline,
  });
  const canScore = bout.state === "BOUT_STATE_IN_PROGRESS";
  const outcome = outcomeOf(scoreControl.scoreA, scoreControl.scoreB);
  const outcomeLabel =
    outcome === "draw" ? "ничья" : outcome === "A" ? bout.fighterA.name : bout.fighterB.name;

  return (
    <Card>
      <CardContent className="pt-6">
        <Col gap={4}>
          <Row align="center" justify="between" gap={3} className="flex-wrap">
            <Badge>{boutStateLabel(bout.state)}</Badge>
            <Row align="center" gap={2}>
              <span className="text-sm text-muted-foreground">бой №{bout.sequenceNumber}</span>
              <Button type="button" size="sm" onClick={onEnterBoutPanel}>
                Вести бой в панели ⛶
              </Button>
            </Row>
          </Row>
          {scoreControl.pendingNotice && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{scoreControl.pendingNotice}</p>
          )}
          <Row gap={6} className="flex-wrap" align="start">
            <ScoreEditor
              label={bout.fighterA.name}
              score={scoreControl.scoreA}
              disabled={!canScore}
              onStep={(delta) => scoreControl.step("A", delta, bout.fighterA.name)}
            />
            <ScoreEditor
              label={bout.fighterB.name}
              score={scoreControl.scoreB}
              disabled={!canScore}
              onStep={(delta) => scoreControl.step("B", delta, bout.fighterB.name)}
            />
          </Row>
          <Row align="center" gap={2}>
            <span className="text-sm text-muted-foreground">Исход:</span>
            <Badge variant="secondary">{outcomeLabel}</Badge>
          </Row>
          {scoreControl.undoLabel && (
            <Button type="button" size="sm" variant="ghost" onClick={scoreControl.undoLastStep}>
              {scoreControl.undoLabel}
            </Button>
          )}
          <Row gap={2} className="flex-wrap">
            <Button
              type="button"
              disabled={offline || bout.state !== "BOUT_STATE_IN_PROGRESS"}
              onClick={onFinish}
            >
              Завершить бой
            </Button>
            <Button type="button" variant="secondary" onClick={onReveal}>
              Показать следующий
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={bout.state !== "BOUT_STATE_FINISHED"}
              onClick={onReopen}
            >
              Переоткрыть предыдущий
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={bout.state !== "BOUT_STATE_IN_PROGRESS"}
              onClick={onReset}
            >
              Сбросить счёт
            </Button>
          </Row>
        </Col>
      </CardContent>
    </Card>
  );
}

function ScoreEditor({
  label,
  score,
  disabled,
  onStep,
}: {
  label: string;
  score: number;
  disabled: boolean;
  onStep: (delta: number) => void;
}) {
  const STEPS = [1, 2, 3, 5] as const;
  return (
    <Col gap={2}>
      <Row align="center" justify="between" gap={3}>
        <span className="font-medium">{label}</span>
        <span className="text-2xl font-bold tabular-nums">{score}</span>
      </Row>
      <Row gap={1} className="flex-wrap">
        {STEPS.map((n) => (
          <Button key={`m${n}`} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onStep(-n)}>
            −{n}
          </Button>
        ))}
        {STEPS.map((n) => (
          <Button key={`p${n}`} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onStep(n)}>
            +{n}
          </Button>
        ))}
      </Row>
    </Col>
  );
}

function BoutList({
  bouts,
  currentBoutId,
  pending,
  onSelect,
}: {
  bouts: BoardBout[];
  currentBoutId: string;
  pending: boolean;
  onSelect: (boutId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (bouts.length === 0) return null;
  const visible = expanded ? bouts : bouts.slice(0, 8);

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <span className="text-sm font-medium text-muted-foreground">Бои по порядку</span>
        {visible.map((b) => (
          <Row key={b.id} align="center" justify="between" gap={2}>
            <Button
              type="button"
              variant={b.id === currentBoutId ? "default" : "ghost"}
              size="sm"
              className="justify-start"
              disabled={pending}
              onClick={() => onSelect(b.id)}
            >
              {b.sequenceNumber}. {b.fighterA.name} — {b.fighterB.name}
            </Button>
            <Badge variant="outline">{boutStateLabel(b.state)}</Badge>
          </Row>
        ))}
        {!expanded && bouts.length > 8 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
            Показать все ({bouts.length})
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
