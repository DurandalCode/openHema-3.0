import { describe, expect, it } from "vitest";
import type { Application } from "@/entities/application/lib/types";
import { historyEntries, type ApplicationEventWithActor } from "./history";

function app(overrides: Partial<Application>): Application {
  return {
    id: "a1",
    nominationId: "n1",
    tournamentId: "t1",
    applicantUserId: "fighter-1",
    applicantDisplayName: "Иван Петров",
    state: "APPLICATION_STATE_PAID",
    club: "Клинок",
    needsEquipment: false,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function ev(overrides: Partial<ApplicationEventWithActor>): ApplicationEventWithActor {
  return {
    type: "APPLICATION_EVENT_TYPE_SUBMITTED",
    actorId: "fighter-1",
    actorDisplayName: "Иван Петров",
    occurredAt: "2026-03-18T10:00:00.000Z",
    sequence: 1,
    ...overrides,
  };
}

describe("historyEntries", () => {
  it("orders entries by time (sequence) ascending", () => {
    const application = app({});
    const history = [
      ev({ type: "APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED", sequence: 3, occurredAt: "2026-03-20T00:00:00.000Z" }),
      ev({ type: "APPLICATION_EVENT_TYPE_SUBMITTED", sequence: 1, occurredAt: "2026-03-18T10:00:00.000Z" }),
      ev({ type: "APPLICATION_EVENT_TYPE_PAYMENT_DECLARED", sequence: 2, occurredAt: "2026-03-19T00:00:00.000Z" }),
    ];

    const entries = historyEntries(application, history);
    const eventEntries = entries.filter((e) => e.kind === "event");

    expect(eventEntries.map((e) => e.label)).toEqual([
      "Подана",
      "Оплата заявлена",
      "Оплата подтверждена",
    ]);
  });

  it("labels the actor's role as 'applicant' when actorId matches the applicant, else 'organizer' (AC-9)", () => {
    const application = app({ applicantUserId: "fighter-1" });
    const history = [
      ev({ actorId: "fighter-1", actorDisplayName: "Иван Петров", sequence: 1 }),
      ev({
        type: "APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED",
        actorId: "admin-1",
        actorDisplayName: "Кораблёва Анна",
        sequence: 2,
      }),
    ];

    const entries = historyEntries(application, history).filter((e) => e.kind === "event");

    expect(entries[0]).toMatchObject({ actorName: "Иван Петров", actorRole: "applicant" });
    expect(entries[1]).toMatchObject({ actorName: "Кораблёва Анна", actorRole: "organizer" });
  });

  it("carries an empty actorName (not a fabricated name or id) when the author has none (AC-12)", () => {
    const application = app({ applicantUserId: "fighter-1" });
    const history = [ev({ actorId: "unknown-actor", actorDisplayName: "", sequence: 1 })];

    const entries = historyEntries(application, history).filter((e) => e.kind === "event");

    expect(entries[0]).toMatchObject({ actorName: "", actorRole: "organizer" });
  });

  it("appends a muted next-step entry for a non-terminal application (FR-18/AC-9)", () => {
    const application = app({ state: "APPLICATION_STATE_PAID" });
    const history = [ev({ sequence: 1 })];

    const entries = historyEntries(application, history);
    const last = entries[entries.length - 1];

    expect(last).toEqual({
      kind: "next-step",
      label: "Боец зарегистрирован",
      waitingOn: "ожидает действия секретаря",
    });
  });

  it("does not append a next-step entry for a terminal application (FR-18)", () => {
    const application = app({ state: "APPLICATION_STATE_REGISTERED" });
    const history = [ev({ sequence: 1 })];

    const entries = historyEntries(application, history);

    expect(entries.every((e) => e.kind === "event")).toBe(true);
  });

  it("labels the AMENDED event type (FR-17)", () => {
    const application = app({ state: "APPLICATION_STATE_REGISTERED" });
    const history = [ev({ type: "APPLICATION_EVENT_TYPE_AMENDED", sequence: 1 })];

    const entries = historyEntries(application, history);

    expect(entries[0]).toMatchObject({ label: "Заявка изменена" });
  });
});
