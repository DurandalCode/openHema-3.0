"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Col } from "@/shared/ui/stack";
import { isTerminal, nextExpectedStep, stateLabel } from "@/entities/application/lib/state";
import type { Application, ApplicationState } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import { useApplicationDetail } from "../api/use-application-detail";
import { useConfirmPayment } from "../api/use-confirm-payment";
import { useRegisterFighter } from "../api/use-register-fighter";
import { rowAction } from "../lib/select-applications";
import { ApplicationHistory } from "./application-history";
import { EditApplicationDialog } from "./edit-application-dialog";

/** statusExplanation — короткое пояснение к текущему статусу заявки (spec FR-16). */
function statusExplanation(state: ApplicationState): string {
  if (state === "APPLICATION_STATE_WITHDRAWN") {
    return "Заявка отозвана — терминальное состояние, боец не будет зарегистрирован.";
  }
  if (state === "APPLICATION_STATE_REGISTERED") {
    return "Боец зарегистрирован — терминальное состояние заявки.";
  }
  const next = nextExpectedStep(state);
  return next ? `Далее: ${next.label}.` : "";
}

/**
 * ApplicationCardDialog — карточка заявки поверх списка (spec FR-16..FR-22):
 * имя заявителя, номинация и клуб, текущий статус с пояснением, история
 * событий, предупреждение о переполнении номинации (если применимо),
 * действие флоу и «Редактировать».
 *
 * `application` — сводная запись из уже загруженного списка (FR-16/AC-9):
 * карточка показывает её сразу, не дожидаясь отдельного запроса истории
 * (spec FR-20). `useApplicationDetail` тянет заявку с историей отдельно —
 * если этот запрос ошибается, ломается только секция истории
 * (`ApplicationHistory` сама показывает ошибку с повтором), а шапка/статус/
 * действие остаются рабочими на данных из `application` (spec FR-25).
 *
 * После успешного действия флоу карточка остаётся открытой и отражает
 * обновлённые статус/историю (spec FR-21/AC-10) — это происходит само
 * собой через инвалидацию `detail`-ключа в `useConfirmPayment`/
 * `useRegisterFighter` (см. `api/`): открытая карточка перезапрашивает
 * данные, а `open`/`onOpenChange` этим действием не трогаются.
 *
 * «Редактировать» открывает `EditApplicationDialog` **вложенным** Radix
 * `Dialog` поверх этого (план, «Риски»: решение — вложенный режим, а не
 * последовательное закрытие карточки; см. `application-card-dialog.test.tsx`
 * — Escape закрывает только верхний (edit) диалог, фокус остаётся в нём).
 */
export function ApplicationCardDialog({
  application,
  nominations,
  overfullNominationIds,
  open,
  onOpenChange,
}: {
  /** Сводная запись заявки (из уже загруженного списка) — используется как мгновенный фолбэк, пока/если детальный запрос не готов. */
  application: Application;
  nominations: Nomination[];
  overfullNominationIds: Set<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  const detail = useApplicationDetail(open ? application.id : null);
  const confirm = useConfirmPayment();
  const register = useRegisterFighter();

  const current = detail.data?.application ?? application;
  const history = detail.data?.history ?? [];
  const nominationTitle = nominations.find((n) => n.id === current.nominationId)?.title ?? "—";
  const isOverfull = overfullNominationIds.has(current.nominationId);
  const action = rowAction(current.state);

  function onActionClick() {
    if (action.kind !== "action") return;
    if (action.action === "confirmPayment") {
      confirm.mutate(current.id, {
        onSuccess: () => toastSuccess("Оплата подтверждена"),
        onError: (err) => toastError(err.message),
      });
    } else {
      register.mutate(current.id, {
        onSuccess: (res) => {
          toastSuccess(
            res.capacityExceeded
              ? "Боец зарегистрирован — номинация переполнена (лимит превышен)"
              : "Боец зарегистрирован",
          );
        },
        onError: (err) => toastError(err.message),
      });
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{current.applicantDisplayName || "—"}</DialogTitle>
            <DialogDescription>
              {nominationTitle} · {current.club || "—"}
            </DialogDescription>
          </DialogHeader>

          <Col gap={4}>
            <Col gap={1}>
              <Badge variant="outline">{stateLabel(current.state)}</Badge>
              <p className="text-xs text-caption-foreground">{statusExplanation(current.state)}</p>
            </Col>

            {isOverfull && (
              <Alert>
                <AlertDescription>
                  Номинация переполнена — лимит бойцов уже выбран.
                </AlertDescription>
              </Alert>
            )}

            <ApplicationHistory
              application={current}
              history={history}
              isLoading={detail.isLoading}
              error={detail.error}
              onRetry={() => detail.refetch()}
            />
          </Col>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
              Редактировать
            </Button>
            {action.kind === "action" ? (
              <Button
                type="button"
                variant={action.action === "register" ? "default" : "outline"}
                loading={action.action === "confirmPayment" ? confirm.isPending : register.isPending}
                onClick={onActionClick}
              >
                {action.action === "confirmPayment" ? "Подтвердить оплату" : "Зарегистрировать"}
              </Button>
            ) : (
              !isTerminal(current.state) && (
                <span className="self-center text-xs text-caption-foreground">{action.reason}</span>
              )
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditApplicationDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        application={current}
        nominations={nominations}
      />
    </>
  );
}
