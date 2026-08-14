"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, MoreVertical } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Tag, type TagTone } from "@/shared/ui/tag";
import { TableRow } from "@/shared/ui/table-row";
import type { Nomination, NominationStatus } from "@/entities/nomination/lib/types";
import { nominationStatusTag } from "@/entities/nomination/lib/types";
import { schemaErrorCount, stageSchemaSummary } from "@/entities/stage/lib/labels";
import { canClose, canReopen, reopenBlockedReason } from "../api/registration-gate";
import type { NominationSchema } from "../api/use-nomination-schemas";

const STATUS_TONE: Record<NominationStatus, TagTone> = {
  NOMINATION_STATUS_UNSPECIFIED: "neutral",
  NOMINATION_STATUS_OPEN: "green",
  NOMINATION_STATUS_CLOSED: "neutral",
  NOMINATION_STATUS_ACTIVE: "red",
  NOMINATION_STATUS_FINISHED: "blue",
};

function errorsWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "ошибок";
  const mod10 = n % 10;
  if (mod10 === 1) return "ошибка";
  if (mod10 >= 2 && mod10 <= 4) return "ошибки";
  return "ошибок";
}

/**
 * SchemaCell — ячейка «Схема» (спека 0028, FR-5/FR-6): сводка этапов по
 * уровням, счётчик **только ошибок** диагностики (предупреждения/инфо —
 * дело экрана схемы, не списка), «Схема не задана» для пустой/авто-схемы,
 * «схема недоступна» при отказе запроса — строка при этом не роняется
 * целиком (FR-6).
 */
function SchemaCell({ schema }: { schema: NominationSchema | undefined }) {
  if (!schema) {
    return <span className="text-sm text-caption-foreground">—</span>;
  }
  if (schema.isError) {
    return <span className="text-sm text-caption-foreground">схема недоступна</span>;
  }
  const summary = stageSchemaSummary(schema.stages);
  const errorCount = schemaErrorCount(schema.issues);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-foreground">{summary || "Схема не задана"}</span>
      {errorCount > 0 && (
        <span className="text-xs text-destructive">
          {errorCount} {errorsWord(errorCount)}
        </span>
      )}
    </div>
  );
}

/**
 * NominationRow — строка таблицы «Номинации» (spec FR-1..FR-11) на
 * `TableRow` (`cells`-API): порядок (стрелки + номер позиции), реквизиты,
 * статус приёма тегом, сводка схемы (`SchemaCell`), плановая вместимость,
 * действия. Действия подписаны словами в выпадающем меню (FR-11) —
 * разрушительное («Удалить») визуально отделено `variant="destructive"`.
 * Строка **не** кликабельна целиком (FR-8) — `TableRow` без `onClick`.
 */
export function NominationRow({
  nomination,
  orderNumber,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  reorderPending,
  schema,
  onEdit,
  onDelete,
  onCloseRegistration,
  onReopenRegistration,
  closePending,
  reopenPending,
}: {
  nomination: Nomination;
  orderNumber: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reorderPending: boolean;
  schema: NominationSchema | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onCloseRegistration: () => void;
  onReopenRegistration: () => void;
  closePending: boolean;
  reopenPending: boolean;
}) {
  const closeAllowed = canClose(nomination.status);
  const reopenAllowed = canReopen(nomination.status);
  const reopenReason = reopenBlockedReason(nomination.status);
  const capacityLabel =
    nomination.fighterCapacity === null ? "не задано" : String(nomination.fighterCapacity);

  return (
    <TableRow
      cells={[
        {
          width: 56,
          node: (
            <div className="flex flex-col items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={isFirst || reorderPending}
                onClick={onMoveUp}
                aria-label="Переместить выше"
              >
                <ArrowUp />
              </Button>
              <span className="font-mono text-xs text-caption-foreground">{orderNumber}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={isLast || reorderPending}
                onClick={onMoveDown}
                aria-label="Переместить ниже"
              >
                <ArrowDown />
              </Button>
            </div>
          ),
        },
        {
          node: (
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">
                {nomination.title || "—"}
              </span>
              {nomination.description && (
                <span className="text-xs text-caption-foreground">{nomination.description}</span>
              )}
              {nomination.metadata.rulesUrl && (
                <a
                  href={nomination.metadata.rulesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline underline-offset-2"
                >
                  Регламент
                </a>
              )}
            </div>
          ),
        },
        {
          width: 140,
          node: (
            <Tag
              label={nominationStatusTag(nomination.status)}
              tone={STATUS_TONE[nomination.status]}
            />
          ),
        },
        { width: 260, node: <SchemaCell schema={schema} /> },
        {
          width: 90,
          text: capacityLabel,
          tone: nomination.fighterCapacity === null ? "muted" : "body",
        },
        {
          width: 56,
          align: "right",
          node: (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Действия">
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/nominations/${nomination.id}/stages`}>Схема</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/applications?nominationId=${nomination.id}`}>Заявки</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!closeAllowed || closePending}
                    onSelect={onCloseRegistration}
                  >
                    Закрыть приём
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!reopenAllowed || reopenPending}
                    onSelect={onReopenRegistration}
                  >
                    {reopenReason ?? "Открыть приём"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onEdit}>Править</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ),
        },
      ]}
    />
  );
}
