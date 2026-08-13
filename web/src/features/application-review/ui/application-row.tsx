"use client";

import type { MouseEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Tag } from "@/shared/ui/tag";
import { Tooltip } from "@/shared/ui/tooltip";
import { cn } from "@/shared/lib/cn";
import { formatDateTime, formatRelativeDay } from "@/shared/lib/datetime";
import type { Application } from "@/entities/application/lib/types";
import { isTerminal, stateCaption } from "@/entities/application/lib/state";
import { rowAction } from "../lib/select-applications";

/**
 * ApplicationRow — строка таблицы «Заявки» (spec FR-1..FR-5): пять колонок
 * (заявитель/номинация/клуб/статус/действие), клик по строке открывает
 * карточку заявки, действие флоу — настоящая кнопка со `stopPropagation`,
 * чтобы клик по ней не открывал карточку тем же действием (spec NFR-4,
 * AC-16). Терминальные строки визуально приглушены, отозванная —
 * дополнительно зачёркнута (FR-3).
 *
 * Решение по «Рискам» плана (аналогично `features/admin/ui/user-row.tsx`,
 * спека 0024, T8): строка НЕ использует `cells`-API `TableRow` — ячейки
 * «Заявитель» (подстрока состояния+даты) и «Действие» (кнопка/причина)
 * нуждаются в разметке, а не в тексте, а слот `node` в `TableRow`
 * появляется отдельным треком (не мержен на момент написания) — строка
 * верстается независимо, переиспользуя визуальный язык `TableRow` (высота
 * `--row-h`, граница снизу, hover-фон).
 *
 * Компонент не владеет мутациями подтверждения/регистрации — вызывающая
 * сторона (таблица/экран) решает, что делать по клику и когда показывать
 * pending-индикатор, так строка остаётся презентационной и легко тестируемой.
 */
export function ApplicationRow({
  application,
  nominationTitle,
  isOverfullNomination,
  onOpenCard,
  onConfirmPayment,
  onRegister,
  confirmPending = false,
  registerPending = false,
  now,
}: {
  application: Application;
  nominationTitle: string;
  isOverfullNomination: boolean;
  onOpenCard: (applicationId: string) => void;
  onConfirmPayment?: (applicationId: string) => void;
  onRegister?: (applicationId: string) => void;
  confirmPending?: boolean;
  registerPending?: boolean;
  now?: Date;
}) {
  const action = rowAction(application.state);
  const terminal = isTerminal(application.state);
  const withdrawn = application.state === "APPLICATION_STATE_WITHDRAWN";

  function onActionClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (action.kind !== "action") return;
    if (action.action === "confirmPayment") onConfirmPayment?.(application.id);
    else onRegister?.(application.id);
  }

  return (
    <div
      data-slot="application-row"
      tabIndex={0}
      onClick={() => onOpenCard(application.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenCard(application.id);
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-4 border-b border-border px-6 outline-none hover:bg-[#f4f2ee] focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:bg-[#111116]",
        terminal && "opacity-[.55]",
      )}
      style={{ height: "var(--row-h)" }}
    >
      <div className="min-w-0 flex-[2]">
        <div className={cn("truncate text-sm font-medium text-foreground", withdrawn && "line-through")}>
          {application.applicantDisplayName || "—"}
        </div>
        <Tooltip content={formatDateTime(application.updatedAt)}>
          <span
            tabIndex={0}
            className="cursor-default text-xs text-caption-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {stateCaption(application.state)} · {formatRelativeDay(application.updatedAt, now)}
          </span>
        </Tooltip>
      </div>

      <div className="min-w-0 flex-1 truncate text-sm text-foreground">{nominationTitle}</div>

      <div className="min-w-0 flex-1 truncate text-sm text-foreground">{application.club || "—"}</div>

      <div className="flex flex-1 flex-col gap-1">
        {(isOverfullNomination || application.needsEquipment) && (
          <div className="flex flex-wrap gap-1">
            {isOverfullNomination && <Tag label="номинация переполнена" tone="amber" />}
            {application.needsEquipment && <Tag label="нужна экипировка" tone="blue" />}
          </div>
        )}
      </div>

      <div className="flex flex-1 justify-end">
        {action.kind === "action" ? (
          <Button
            type="button"
            size="sm"
            variant={action.action === "register" ? "default" : "outline"}
            loading={action.action === "confirmPayment" ? confirmPending : registerPending}
            onClick={onActionClick}
          >
            {action.action === "confirmPayment" ? "Подтвердить оплату" : "Зарегистрировать"}
          </Button>
        ) : (
          <span className="text-right text-xs text-caption-foreground">{action.reason}</span>
        )}
      </div>
    </div>
  );
}
