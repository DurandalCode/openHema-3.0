"use client";

import { Alert, AlertDescription } from "@/shared/ui/alert";
import { EmptyState } from "@/shared/ui/empty-state";
import { SkeletonRows } from "@/shared/ui/skeletons";
import { Col, Row } from "@/shared/ui/stack";
import { journalEntryText, journalEntryTime } from "@/entities/arena-live/lib/journal";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import { useArenaJournal } from "../api/use-arena-journal";

/**
 * ArenaJournal — журнал боёв площадки (спека 0033, FR-33/FR-35, AC-19): лента
 * событий боя (начат/счёт/завершён/переоткрыт/сброшен) новыми записями
 * вперёд, с временем и именем того, кто вызвал событие. Показывается в
 * режиме управления (`widgets/arena-console`).
 *
 * Называется журналом **боёв**, не площадки (spec FR-36): постановка/снятие
 * пула и события таймера сюда не попадают — оба вне event-sourced журнала
 * боя (ADR 0011), который единственный здесь читается.
 */
export function ArenaJournal({ arenaId }: { arenaId: string }) {
  const { data: entries, isLoading, error } = useArenaJournal(arenaId);

  if (isLoading) {
    return <SkeletonRows rows={3} cols={2} />;
  }
  if (error instanceof UnauthorizedError) {
    // Спека 0039, FR-18/AC-12: сессия истекла — за происходящее отвечает
    // глобальный диалог «Сессия истекла», свой блок ошибки не рисуем.
    return null;
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  if (!entries || entries.length === 0) {
    return (
      <EmptyState
        title="Пока пусто"
        hint="Записи появятся здесь с первым действием по бою: начало, счёт, завершение."
      />
    );
  }

  return (
    <Col gap={1} data-testid="arena-journal">
      {entries.map((entry, i) => (
        <Row
          key={`${entry.boutId}-${entry.kind}-${i}`}
          align="baseline"
          gap={2}
          className="text-sm"
        >
          <span className="font-mono text-xs text-muted-foreground">
            {journalEntryTime(entry)}
          </span>
          <span>{journalEntryText(entry)}</span>
          {entry.actorDisplayName && (
            <span className="text-xs text-muted-foreground">· {entry.actorDisplayName}</span>
          )}
        </Row>
      ))}
    </Col>
  );
}
