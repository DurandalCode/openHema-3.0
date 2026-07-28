"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Col, Row } from "@/shared/ui/stack";
import {
  boutStateLabel,
  outcomeOf,
  type BoardBout,
} from "@/entities/pool/lib/types";
import { useBoutBoard } from "../api/use-bout-board";
import { useFinishBout } from "../api/use-finish-bout";
import { useReopenBout } from "../api/use-reopen-bout";
import { useResetBout } from "../api/use-reset-bout";
import { useScoreBout } from "../api/use-score-bout";
import { useSetCurrentBout } from "../api/use-set-current-bout";
import { applyScoreStep } from "../model/score-step";

const STEPS = [1, 2, 3, 5] as const;

/**
 * BoutBoard — экран ведения боёв стоящего на арене пула (спека 0013,
 * FR-14): текущий бой (пара, счёт, быстрые шаги ±1/±2/±3/±5 + ручной ввод,
 * кнопки жизненного цикла, исход) и список боёв пула по порядку с
 * циркуляцией (клик по бою → делает его текущим). Начать бой отдельной
 * кнопкой здесь не делаем (спека 0015): старт боя теперь — побочный эффект
 * кнопки «Старт» таймера (`TimerControls`), если текущий бой ещё не начат.
 */
export function BoutBoard({ arenaId }: { arenaId: string }) {
  const { data: board, isLoading, error } = useBoutBoard(arenaId);
  const setCurrent = useSetCurrentBout(arenaId);
  const score = useScoreBout(arenaId);
  const finish = useFinishBout(arenaId);
  const reopen = useReopenBout(arenaId);
  const reset = useResetBout(arenaId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  if (!board || !board.pool) {
    return <p className="text-sm text-muted-foreground">На арене нет пула — вести нечего.</p>;
  }

  const poolId = board.pool.id;
  const currentBout = board.bouts.find((b) => b.id === board.currentBoutId) ?? null;

  const mutationError =
    setCurrent.error?.message ??
    score.error?.message ??
    finish.error?.message ??
    reopen.error?.message ??
    reset.error?.message ??
    null;

  const anyPending =
    setCurrent.isPending ||
    score.isPending ||
    finish.isPending ||
    reopen.isPending ||
    reset.isPending;

  function sendScore(scoreA: number, scoreB: number) {
    score.mutate({ poolId, scoreA, scoreB });
  }

  return (
    <Col gap={4}>
      {mutationError && (
        <Alert variant="destructive">
          <AlertDescription>{mutationError}</AlertDescription>
        </Alert>
      )}
      {currentBout ? (
        <CurrentBoutCard
          bout={currentBout}
          pending={anyPending}
          onStepA={(delta) => sendScore(applyScoreStep(currentBout.scoreA, delta), currentBout.scoreB)}
          onStepB={(delta) => sendScore(currentBout.scoreA, applyScoreStep(currentBout.scoreB, delta))}
          onManualA={(value) => sendScore(value, currentBout.scoreB)}
          onManualB={(value) => sendScore(currentBout.scoreA, value)}
          onFinish={() => finish.mutate(poolId)}
          onReopen={() => reopen.mutate(poolId)}
          onReset={() => reset.mutate(poolId)}
        />
      ) : (
        <p className="text-sm text-muted-foreground">У пула нет боёв.</p>
      )}
      <BoutList
        bouts={board.bouts}
        currentBoutId={board.currentBoutId}
        pending={setCurrent.isPending}
        onSelect={(boutId) => setCurrent.mutate({ poolId, boutId })}
      />
    </Col>
  );
}

function CurrentBoutCard({
  bout,
  pending,
  onStepA,
  onStepB,
  onManualA,
  onManualB,
  onFinish,
  onReopen,
  onReset,
}: {
  bout: BoardBout;
  pending: boolean;
  onStepA: (delta: number) => void;
  onStepB: (delta: number) => void;
  onManualA: (value: number) => void;
  onManualB: (value: number) => void;
  onFinish: () => void;
  onReopen: () => void;
  onReset: () => void;
}) {
  const canScore = bout.state === "BOUT_STATE_IN_PROGRESS";
  const outcome = outcomeOf(bout.scoreA, bout.scoreB);
  const outcomeLabel =
    outcome === "draw" ? "ничья" : outcome === "A" ? bout.fighterA.name : bout.fighterB.name;

  return (
    <Card>
      <CardContent className="pt-6">
        <Col gap={4}>
          <Row align="center" justify="between" gap={3} className="flex-wrap">
            <Badge>{boutStateLabel(bout.state)}</Badge>
            <span className="text-sm text-muted-foreground">
              Тур {bout.roundNumber} · бой №{bout.sequenceNumber}
            </span>
          </Row>
          <Row gap={6} className="flex-wrap" align="start">
            <ScoreEditor
              key={`a-${bout.id}-${bout.scoreA}`}
              label={bout.fighterA.name}
              score={bout.scoreA}
              disabled={!canScore || pending}
              onStep={onStepA}
              onManualSubmit={onManualA}
            />
            <ScoreEditor
              key={`b-${bout.id}-${bout.scoreB}`}
              label={bout.fighterB.name}
              score={bout.scoreB}
              disabled={!canScore || pending}
              onStep={onStepB}
              onManualSubmit={onManualB}
            />
          </Row>
          <Row align="center" gap={2}>
            <span className="text-sm text-muted-foreground">Исход:</span>
            <Badge variant="secondary">{outcomeLabel}</Badge>
          </Row>
          <Row gap={2} className="flex-wrap">
            <Button
              type="button"
              size="sm"
              disabled={pending || bout.state !== "BOUT_STATE_IN_PROGRESS"}
              onClick={onFinish}
            >
              Завершить
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || bout.state !== "BOUT_STATE_IN_PROGRESS"}
              onClick={onReset}
            >
              Сбросить
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || bout.state !== "BOUT_STATE_FINISHED"}
              onClick={onReopen}
            >
              Переоткрыть
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
  onManualSubmit,
}: {
  label: string;
  score: number;
  disabled: boolean;
  onStep: (delta: number) => void;
  onManualSubmit: (value: number) => void;
}) {
  const [manual, setManual] = useState(String(score));

  return (
    <Col gap={2}>
      <Row align="center" justify="between" gap={3}>
        <span className="font-medium">{label}</span>
        <span className="text-2xl font-bold tabular-nums">{score}</span>
      </Row>
      <Row gap={1} wrap>
        {STEPS.map((n) => (
          <Button
            key={`minus-${n}`}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onStep(-n)}
          >
            −{n}
          </Button>
        ))}
        {STEPS.map((n) => (
          <Button
            key={`plus-${n}`}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onStep(n)}
          >
            +{n}
          </Button>
        ))}
      </Row>
      <Row gap={2} align="center">
        <Input
          type="number"
          min={0}
          value={manual}
          disabled={disabled}
          onChange={(e) => setManual(e.target.value)}
          className="w-20"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            const n = Number(manual);
            if (Number.isFinite(n) && n >= 0) onManualSubmit(Math.trunc(n));
          }}
        >
          Задать
        </Button>
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
  if (bouts.length === 0) {
    return null;
  }

  return (
    <Col gap={1} className="border-t pt-2">
      <span className="text-sm font-medium text-muted-foreground">Бои пула</span>
      <Col gap={1}>
        {bouts.map((b) => (
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
      </Col>
    </Col>
  );
}
