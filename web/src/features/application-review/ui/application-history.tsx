"use client";

import { Button } from "@/shared/ui/button";
import { formatDateTime } from "@/shared/lib/datetime";
import type { Application, ApplicationEvent } from "@/entities/application/lib/types";
import { historyEntries } from "../lib/history";

const ROLE_LABEL = { applicant: "заявитель", organizer: "организатор" } as const;

/**
 * ApplicationHistory — журнал событий заявки в карточке (spec FR-17..FR-19):
 * маркеры-точки, дата/время через `formatDateTime`, имя+роль автора (роль
 * без имени, если имени нет — AC-12), приглушённая запись ожидаемого
 * следующего шага для нетерминальной заявки следом за событиями (FR-18).
 * Загрузка/ошибка — отдельным блоком внутри этого компонента (spec FR-25):
 * ошибка запроса истории не должна ломать остальную карточку.
 */
export function ApplicationHistory({
  application,
  history,
  isLoading,
  error,
  onRetry,
}: {
  application: Application;
  history: ApplicationEvent[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <p data-slot="application-history" className="text-sm text-muted-foreground">
        Загрузка истории…
      </p>
    );
  }

  if (error) {
    return (
      <div data-slot="application-history" className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      </div>
    );
  }

  const entries = historyEntries(application, history);

  return (
    <ol data-slot="application-history" className="flex flex-col gap-3">
      {entries.map((entry, i) =>
        entry.kind === "event" ? (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground" />
            <div className="flex flex-col">
              <span className="font-medium text-foreground">{entry.label}</span>
              <span className="text-xs text-caption-foreground">
                {formatDateTime(entry.occurredAt)} ·{" "}
                {entry.actorName
                  ? `${entry.actorName} · ${ROLE_LABEL[entry.actorRole]}`
                  : ROLE_LABEL[entry.actorRole]}
              </span>
            </div>
          </li>
        ) : (
          <li key={i} className="flex items-start gap-2 text-sm opacity-60">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span>{entry.label}</span>
          </li>
        ),
      )}
    </ol>
  );
}
