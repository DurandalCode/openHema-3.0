"use client";

import { Badge } from "@/shared/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Col } from "@/shared/ui/stack";
import { stateLabel, stateTone } from "@/entities/application/lib/state";
import type { Application } from "@/entities/application/lib/types";
import { ApplicationHistory } from "@/entities/application/ui/application-history";
import { useApplicationDetail } from "../api/use-application-detail";

/**
 * ApplicationHistoryDialog — история событий своей заявки для заявителя
 * (спека 0040, сценарий 4, FR-12/FR-13/AC-8): текущий статус + хронология
 * смен (кто, когда) поверх карточки в списке «Мои заявки». Переиспользует
 * `ApplicationHistory` из `entities/application/ui` — тот же компонент,
 * что показывает admin на карточке заявки (`application-review`), вынесен
 * туда как общий, чтобы фичи `my-applications` и `application-review` не
 * импортировали друг друга (FSD-граница, `web/AGENTS.md` п.6).
 *
 * `application` — сводная запись из уже загруженного списка «Мои заявки»:
 * карточка показывает статус сразу, не дожидаясь отдельного запроса истории
 * (тот же приём, что у admin `ApplicationCardDialog`). `useApplicationDetail`
 * тянет заявку с историей отдельно — если этот запрос ошибается, ломается
 * только секция истории (`ApplicationHistory` сама показывает ошибку с
 * повтором), а статус в шапке остаётся рабочим на данных из `application`.
 */
export function ApplicationHistoryDialog({
  application,
  open,
  onOpenChange,
}: {
  application: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useApplicationDetail(open ? application.id : null);

  const current = detail.data?.application ?? application;
  const history = detail.data?.history ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>История заявки</DialogTitle>
          <DialogDescription>{current.club || "—"}</DialogDescription>
        </DialogHeader>

        <Col gap={4}>
          <Badge tone={stateTone(current.state)}>{stateLabel(current.state)}</Badge>

          <ApplicationHistory
            application={current}
            history={history}
            isLoading={detail.isLoading}
            error={detail.error}
            onRetry={() => detail.refetch()}
          />
        </Col>
      </DialogContent>
    </Dialog>
  );
}
