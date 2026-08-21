"use client";

import { useEffect, useRef, useState } from "react";
import { useScoreBout } from "@/features/bout-board/api/use-score-bout";
import { applyScoreStep } from "@/features/bout-board/model/score-step";
import { applyPendingStep, clearPending, type PendingScore } from "@/features/bout-board/model/pending-score";
import { pushStep, undoTarget, type ScoreUndoState } from "@/features/bout-board/model/score-undo";
import { toastError, toastSuccess } from "@/shared/lib/toast";

/**
 * useBoutScoreControl — правка счёта текущего боя с учётом офлайна (спека
 * 0033, FR-19/FR-26/FR-27, AC-8/AC-13): общая логика для `ManagementView` и
 * `BoutPanelView` — оба режима правят один и тот же счёт одинаково, разница
 * только в разметке кнопок.
 *
 * Онлайн: каждый шаг уходит на сервер сразу (`useScoreBout`, абсолютное
 * значение, как раньше). Офлайн: шаги копятся в `pending` (T11) и
 * показываются локально; при восстановлении связи уходит **одно**
 * абсолютное значение (AC-13), после успеха — тост (правило 0023) и
 * `pending` очищается. Отмена последнего шага (T12) работает в обоих
 * режимах и сбрасывается при смене боя.
 */
export function useBoutScoreControl({
  arenaId,
  poolId,
  boutId,
  serverScoreA,
  serverScoreB,
  offline,
}: {
  arenaId: string;
  poolId: string | null;
  boutId: string | null;
  serverScoreA: number;
  serverScoreB: number;
  offline: boolean;
}) {
  const score = useScoreBout(arenaId);
  const [pending, setPending] = useState<PendingScore>(null);
  const [undo, setUndo] = useState<ScoreUndoState>(null);
  const wasOfflineRef = useRef(offline);

  // Смена боя сбрасывает и удержанный офлайн-счёт, и отмену (FR-19/FR-26 —
  // оба привязаны к конкретному бою, не к площадке вообще).
  useEffect(() => {
    setPending(null);
    setUndo(null);
  }, [boutId]);

  const scoreA = pending?.scoreA ?? serverScoreA;
  const scoreB = pending?.scoreB ?? serverScoreB;

  function step(side: "A" | "B", delta: number, sideLabel: string) {
    if (!poolId || !boutId) return;
    const before = { scoreA, scoreB };
    setUndo(pushStep(undo, boutId, before, side, delta, sideLabel));

    if (offline) {
      setPending((prev) => applyPendingStep(prev, before, side, delta));
      return;
    }
    const next =
      side === "A"
        ? { scoreA: applyScoreStep(before.scoreA, delta), scoreB: before.scoreB }
        : { scoreA: before.scoreA, scoreB: applyScoreStep(before.scoreB, delta) };
    score.mutate(
      { poolId, scoreA: next.scoreA, scoreB: next.scoreB },
      { onError: (err) => toastError(err.message) },
    );
  }

  function undoLastStep() {
    if (!poolId || !boutId) return;
    const target = undoTarget(undo, boutId);
    if (!target) return;
    setUndo(null);
    if (offline) {
      setPending(
        target.scoreA === serverScoreA && target.scoreB === serverScoreB ? clearPending() : target,
      );
      return;
    }
    score.mutate(
      { poolId, scoreA: target.scoreA, scoreB: target.scoreB },
      { onError: (err) => toastError(err.message) },
    );
  }

  // Восстановление связи — досылка удержанного значения одним запросом
  // (FR-27, AC-13): следим за фронтом offline true→false, а не просто за
  // pending, чтобы не отправлять повторно на каждый ре-рендер.
  useEffect(() => {
    if (wasOfflineRef.current && !offline && pending && poolId) {
      score.mutate(
        { poolId, scoreA: pending.scoreA, scoreB: pending.scoreB },
        {
          onSuccess: () => {
            toastSuccess("Счёт отправлен");
            setPending(clearPending());
          },
          // Досылка не удалась (снова офлайн либо сервер отклонил) —
          // pending НЕ очищаем: значение остаётся под рукой для следующей
          // попытки (ручной `reconnect()` либо новый переход offline→online).
          onError: (err) => toastError(err.message),
        },
      );
    }
    wasOfflineRef.current = offline;
  }, [offline, pending, poolId, score]);

  const undoLabel = boutId ? (undoTarget(undo, boutId) ? undo?.label ?? null : null) : null;

  return {
    scoreA,
    scoreB,
    /** pendingNotice — сообщение над счётом, пока значение удержано локально (FR-26). */
    pendingNotice: pending ? "Будет отправлен при восстановлении связи" : null,
    step,
    undoLabel,
    undoLastStep,
    isSending: score.isPending,
  };
}
