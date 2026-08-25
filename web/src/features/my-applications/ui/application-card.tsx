"use client";

import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Tag } from "@/shared/ui/tag";
import { Col, Row } from "@/shared/ui/stack";
import { cn } from "@/shared/lib/cn";
import { toastError, toastSuccess } from "@/shared/lib/toast";
import {
  allowedApplicantActions,
  isTerminal,
  nextExpectedStep,
  stateLabel,
  stateTone,
} from "@/entities/application/lib/state";
import type { Application } from "@/entities/application/lib/types";
import { applicationErrorMessage } from "../api/errors";
import type { ApplicationRequestError } from "../api/mutation-error";
import { useDeclarePayment } from "../api/use-declare-payment";
import { useWithdrawApplication } from "../api/use-withdraw-application";
import { ApplicationHistoryDialog } from "./application-history-dialog";

/**
 * ApplicationCard — карточка заявки в списке «Мои заявки» (спека 0036,
 * FR-15..FR-23): название номинации первым (или без него, FR-26), плашка
 * состояния своей тональности, приглушение терминальной заявки, ожидаемый
 * следующий шаг у нетерминальной, клуб/тег экипировки только при заданных
 * значениях, действия заявителя по `allowedApplicantActions`. «Отозвать»
 * необратимо — только через `ConfirmDialog` (FR-21); «Я оплатил» —
 * немедленно, без диалога (FR-22). Успех/отказ — только тост (FR-23,
 * правило `web/AGENTS.md`).
 *
 * «История» открывает `ApplicationHistoryDialog` (спека 0040, сценарий 4,
 * FR-12/FR-13/AC-8) — доступна всегда, включая терминальные заявки: история
 * смен статуса не перестаёт быть интересной после того, как заявка отозвана
 * или боец зарегистрирован.
 */
export function ApplicationCard({
  application,
  nominationTitle,
}: {
  application: Application;
  nominationTitle?: string;
}) {
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const declarePayment = useDeclarePayment();
  const withdraw = useWithdrawApplication();

  const terminal = isTerminal(application.state);
  const actions = allowedApplicantActions(application.state);
  const step = terminal ? null : nextExpectedStep(application.state);

  function handleDeclarePayment() {
    declarePayment.mutate(application.id, {
      onSuccess: () => toastSuccess("Оплата отмечена"),
      onError: (error) => {
        const err = error as ApplicationRequestError;
        toastError(applicationErrorMessage(err.message, err.status), {
          retry: handleDeclarePayment,
        });
      },
    });
  }

  function handleWithdraw() {
    withdraw.mutate(application.id, {
      onSuccess: () => toastSuccess("Заявка отозвана"),
      onError: (error) => {
        const err = error as ApplicationRequestError;
        toastError(applicationErrorMessage(err.message, err.status), {
          retry: handleWithdraw,
        });
      },
    });
  }

  return (
    <Card className={cn(terminal && "opacity-60")}>
      <CardContent className="pt-6">
        <Col gap={3}>
          <Col gap={1} align="start">
            {nominationTitle !== undefined && (
              <span className="text-[15px] font-bold text-foreground">{nominationTitle}</span>
            )}
            <Badge tone={stateTone(application.state)}>{stateLabel(application.state)}</Badge>
          </Col>

          {step && (
            <p className="text-xs text-muted-foreground">
              {step.label} · ожидает: {step.waitingOn}
            </p>
          )}

          {(application.club || application.needsEquipment) && (
            <Row gap={2} align="center" wrap>
              {application.club && (
                <span className="text-xs text-muted-foreground">Клуб: {application.club}</span>
              )}
              {application.needsEquipment && <Tag label="нужна экипировка" tone="blue" />}
            </Row>
          )}

          <Row gap={2}>
            {actions.includes("declarePayment") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={declarePayment.isPending}
                onClick={handleDeclarePayment}
              >
                Я оплатил
              </Button>
            )}
            {actions.includes("withdraw") && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                loading={withdraw.isPending}
                onClick={() => setConfirmWithdrawOpen(true)}
              >
                Отозвать
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
              История
            </Button>
          </Row>
        </Col>
      </CardContent>

      <ConfirmDialog
        open={confirmWithdrawOpen}
        onOpenChange={setConfirmWithdrawOpen}
        title="Отозвать заявку?"
        consequences="Заявка станет отозванной необратимо. Вернуться в номинацию можно только новой заявкой и только пока приём открыт."
        confirmLabel="Отозвать"
        destructive
        onConfirm={handleWithdraw}
      />

      <ApplicationHistoryDialog
        application={application}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </Card>
  );
}
