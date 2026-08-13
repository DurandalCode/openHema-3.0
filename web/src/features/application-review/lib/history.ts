import type { Application } from "@/entities/application/lib/types";
// TEMPORARY (join-wave stub, see `./state-stub.ts` header): `eventLabel`,
// `isTerminal`, `nextExpectedStep` and `ApplicationEventWithActor` live in
// entities/application/lib/state.ts (+ lib/types.ts) once Track B merges —
// replace this import accordingly at join time (tasks.md T15).
import {
  eventLabel,
  isTerminal,
  nextExpectedStep,
  type ApplicationEventWithActor,
} from "./state-stub";

export type { ApplicationEventWithActor };

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
  history: ApplicationEventWithActor[],
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
