"use client";

import { useState } from "react";
import { RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Row } from "@/shared/ui/stack";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import type { Stage } from "@/entities/stage/lib/types";
import { BuildStageDialog } from "@/features/stage-build/ui/build-stage-dialog";
import { useResetLayout } from "@/features/nomination-pools/api/use-reset-layout";
import { useUndo } from "@/features/nomination-pools/api/use-undo";
import { useResetBracket } from "@/features/bracket-seeding/api/use-reset-bracket";
import { useUndoBracket } from "@/features/bracket-seeding/api/use-undo-bracket";

/**
 * StageActions — строка действий страницы этапа (спека 0032, FR-12..FR-14):
 * «Сформировать»/«Сформировать заново», «Отменить последнее действие»,
 * «Сбросить этап». Вторая точка входа к формированию — первая остаётся на
 * карточке этапа схемы (0031, FR-11, `stage-card.tsx`) и продолжает
 * работать как раньше.
 *
 * Групповой этап и сетка используют разные мутации (`nomination-pools` vs
 * `bracket-seeding`) — тот же дуальный вызов хуков по типу, что уже
 * установлен в `widgets/nomination-schema/stage-card.tsx` (`ResetQuickAction`):
 * оба набора хуков вызываются безусловно (правило хуков), но мутирует
 * только тот, что соответствует `stage.type`.
 *
 * `filled`/`canUndo` — данные, уже загруженные вызывающим (`useLayout`/
 * `useBracket` в `stage-page-screen.tsx`, join-волна) — компонент не
 * дублирует запрос.
 */
export function StageActions({
  stage,
  filled,
  canUndo,
}: {
  stage: Stage;
  filled: number;
  canUndo: boolean;
}) {
  const isBracket = stage.type === "STAGE_TYPE_BRACKET";
  const hasComposition = filled > 0;

  const resetLayout = useResetLayout(stage.id);
  const resetBracket = useResetBracket(stage.id);
  const undoLayout = useUndo(stage.id);
  const undoBracket = useUndoBracket(stage.id);

  const resetPending = isBracket ? resetBracket.isPending : resetLayout.isPending;
  const undoPending = isBracket ? undoBracket.isPending : undoLayout.isPending;

  const [buildOpen, setBuildOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Оба хука («Отменить», «Сбросить») переводят отказ на русский сами, в
  // mutationFn по HTTP-статусу — в тост идёт готовый err.message. Повторный
  // перевод строки, у которой статуса уже нет, отдавал бы generic-текст.
  function handleUndo() {
    const onError = (err: Error) => toastError(err.message);
    if (isBracket) {
      undoBracket.mutate(undefined, { onError });
    } else {
      undoLayout.mutate(undefined, { onError });
    }
  }

  /** Сброс — тост-успех/тост-ошибка (FR-14); в отличие от `stage-card`'s
   * `ResetQuickAction`, `toastUndo` здесь не нужен — «Отменить последнее
   * действие» уже есть постоянной кнопкой в этой же строке. */
  function handleResetConfirm() {
    if (isBracket) {
      resetBracket.mutate(undefined, {
        onSuccess: () => toastSuccess("Состав этапа сброшен"),
        onError: (err: Error) => toastError(err.message, { retry: handleResetConfirm }),
      });
    } else {
      resetLayout.mutate(undefined, {
        onSuccess: () => toastSuccess("Состав этапа сброшен"),
        onError: (err: Error) => toastError(err.message, { retry: handleResetConfirm }),
      });
    }
  }

  return (
    <Row align="center" gap={2} className="flex-wrap" data-testid="stage-actions">
      {stage.rule &&
        (hasComposition ? (
          <Row align="center" gap={2}>
            <Button type="button" size="sm" variant="outline" disabled>
              Сформировать заново
            </Button>
            <span className="text-xs text-muted-foreground" data-testid="build-again-blocked-reason">
              Сначала сбросьте состав этапа
            </span>
          </Row>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setBuildOpen(true)}>
            Сформировать
          </Button>
        ))}

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canUndo}
        onClick={handleUndo}
        loading={undoPending}
      >
        <Undo2 /> Отменить последнее действие
      </Button>

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setConfirmResetOpen(true)}
        loading={resetPending}
      >
        <RotateCcw /> Сбросить этап
      </Button>

      <BuildStageDialog stage={stage} open={buildOpen} onOpenChange={setBuildOpen} />

      <ConfirmDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        title={`Сбросить состав «${stage.title}»?`}
        consequences={
          isBracket
            ? "Все слоты будут очищены."
            : "Все пулы будут удалены, бойцы вернутся в нераспределённые."
        }
        confirmLabel="Да, сбросить"
        destructive
        onConfirm={handleResetConfirm}
      />
    </Row>
  );
}
