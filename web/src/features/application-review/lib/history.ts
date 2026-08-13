import type { Application, ApplicationEvent } from "@/entities/application/lib/types";
import { eventLabel, isTerminal, nextExpectedStep } from "@/entities/application/lib/state";

export type HistoryEntry =
  | {
      kind: "event";
      label: string;
      occurredAt: string;
      actorName: string;
      actorRole: "applicant" | "organizer";
    }
  | { kind: "next-step"; label: string; waitingOn: string };

/**
 * historyEntries — упорядоченная (по возрастанию времени) история заявки
 * (spec FR-17) + опциональная приглушённая запись ожидаемого следующего
 * шага для нетерминальной заявки, следом за произошедшими событиями (spec
 * FR-18). Роль автора выводится сравнением `actorId` события с
 * `applicantUserId` заявки («заявитель» / «организатор», spec FR-19);
 * пустое имя автора не заменяется идентификатором — запись несёт только
 * роль, решение о рендере «только роль» остаётся за UI (AC-12).
 */
export function historyEntries(
  application: Application,
  history: ApplicationEvent[],
): HistoryEntry[] {
  const sorted = [...history].sort((a, b) => a.sequence - b.sequence);

  const entries: HistoryEntry[] = sorted.map((event) => ({
    kind: "event" as const,
    label: eventLabel(event.type),
    occurredAt: event.occurredAt,
    actorName: event.actorDisplayName,
    actorRole: event.actorId === application.applicantUserId ? "applicant" : "organizer",
  }));

  if (!isTerminal(application.state)) {
    const next = nextExpectedStep(application.state);
    if (next) {
      entries.push({ kind: "next-step", label: next.label, waitingOn: next.waitingOn });
    }
  }

  return entries;
}
