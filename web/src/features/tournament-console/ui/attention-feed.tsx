import { AlertRow } from "./alert-row";
import type { ConsoleAlert } from "@/entities/tournament-console/lib/types";

/**
 * AttentionFeed — лента «требует внимания» пульта (спека 0043, FR-14):
 * список замеченных операционных проблем. Пуста — не ошибка (FR-16, записи
 * гаснут сами вместе с условием, которое их породило).
 */
export function AttentionFeed({ alerts, now = new Date() }: { alerts: ConsoleAlert[]; now?: Date }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-caption-foreground">Всё в порядке — сигналов нет.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert, i) => (
        // ConsoleAlert не несёт собственного id (не хранится, FR-16) — ключ
        // из состава полей, идентифицирующих запись однозначно в рамках
        // одного кадра.
        <AlertRow key={`${alert.kind}-${alert.arenaId}-${alert.nominationId}-${alert.boutId}-${i}`} alert={alert} now={now} />
      ))}
    </div>
  );
}
