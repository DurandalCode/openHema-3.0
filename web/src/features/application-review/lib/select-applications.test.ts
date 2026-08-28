import { describe, expect, it } from "vitest";
import type { Application } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import {
  overfullNominationIds,
  rowAction,
  sortApplications,
  toStatusCountsRecord,
} from "./select-applications";

function app(overrides: Partial<Application>): Application {
  return {
    id: "a1",
    nominationId: "n1",
    tournamentId: "t1",
    applicantUserId: "u1",
    applicantDisplayName: "Иван Петров",
    state: "APPLICATION_STATE_SUBMITTED",
    club: "Клинок",
    needsEquipment: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function nomination(overrides: Partial<Nomination>): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Лонгсворд",
    description: "",
    fighterCapacity: null,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("sortApplications", () => {
  it("orders groups: awaiting confirmation, paid, submitted, terminal (FR-6)", () => {
    const submitted = app({ id: "submitted", state: "APPLICATION_STATE_SUBMITTED" });
    const paid = app({ id: "paid", state: "APPLICATION_STATE_PAID" });
    const awaiting = app({
      id: "awaiting",
      state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION",
    });
    const registered = app({ id: "registered", state: "APPLICATION_STATE_REGISTERED" });
    const withdrawn = app({ id: "withdrawn", state: "APPLICATION_STATE_WITHDRAWN" });

    const sorted = sortApplications([submitted, paid, awaiting, registered, withdrawn]);

    expect(sorted.map((a) => a.id)).toEqual(["awaiting", "paid", "submitted", "registered", "withdrawn"]);
  });

  it("orders within a group from oldest updatedAt to newest", () => {
    const older = app({ id: "older", state: "APPLICATION_STATE_PAID", updatedAt: "2026-01-01T00:00:00.000Z" });
    const newer = app({ id: "newer", state: "APPLICATION_STATE_PAID", updatedAt: "2026-01-05T00:00:00.000Z" });

    const sorted = sortApplications([newer, older]);

    expect(sorted.map((a) => a.id)).toEqual(["older", "newer"]);
  });

  it("does not mutate the input array", () => {
    const list = [app({ id: "a" }), app({ id: "b", state: "APPLICATION_STATE_PAID" })];
    const copy = [...list];
    sortApplications(list);
    expect(list).toEqual(copy);
  });
});

describe("toStatusCountsRecord", () => {
  it("converts server status_counts into a Record, defaulting missing states to 0 (FR-4)", () => {
    expect(
      toStatusCountsRecord([
        { status: "APPLICATION_STATE_SUBMITTED", count: 31 },
        { status: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION", count: 6 },
        { status: "APPLICATION_STATE_PAID", count: 1 },
        { status: "APPLICATION_STATE_REGISTERED", count: 124 },
        { status: "APPLICATION_STATE_WITHDRAWN", count: 2 },
      ]),
    ).toEqual({
      APPLICATION_STATE_UNSPECIFIED: 0,
      APPLICATION_STATE_SUBMITTED: 31,
      APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION: 6,
      APPLICATION_STATE_PAID: 1,
      APPLICATION_STATE_REGISTERED: 124,
      APPLICATION_STATE_WITHDRAWN: 2,
    });
  });

  it("returns all-zero counts for an empty list", () => {
    expect(toStatusCountsRecord([])).toEqual({
      APPLICATION_STATE_UNSPECIFIED: 0,
      APPLICATION_STATE_SUBMITTED: 0,
      APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION: 0,
      APPLICATION_STATE_PAID: 0,
      APPLICATION_STATE_REGISTERED: 0,
      APPLICATION_STATE_WITHDRAWN: 0,
    });
  });
});

describe("overfullNominationIds", () => {
  it("skips nominations with no fighterCapacity set", () => {
    const apps = [app({ id: "1", nominationId: "n1", state: "APPLICATION_STATE_REGISTERED" })];
    const nominations = [nomination({ id: "n1", fighterCapacity: null })];
    expect(overfullNominationIds(apps, nominations)).toEqual(new Set());
  });

  it("flags a nomination exactly at the capacity boundary (>=, not >)", () => {
    const apps = [
      app({ id: "1", nominationId: "n1", state: "APPLICATION_STATE_REGISTERED" }),
      app({ id: "2", nominationId: "n1", state: "APPLICATION_STATE_REGISTERED" }),
    ];
    const nominations = [nomination({ id: "n1", fighterCapacity: 2 })];
    expect(overfullNominationIds(apps, nominations)).toEqual(new Set(["n1"]));
  });

  it("does not flag a nomination below capacity", () => {
    const apps = [app({ id: "1", nominationId: "n1", state: "APPLICATION_STATE_REGISTERED" })];
    const nominations = [nomination({ id: "n1", fighterCapacity: 2 })];
    expect(overfullNominationIds(apps, nominations)).toEqual(new Set());
  });

  it("only counts REGISTERED applications toward the limit", () => {
    const apps = [
      app({ id: "1", nominationId: "n1", state: "APPLICATION_STATE_PAID" }),
      app({ id: "2", nominationId: "n1", state: "APPLICATION_STATE_PAID" }),
    ];
    const nominations = [nomination({ id: "n1", fighterCapacity: 1 })];
    expect(overfullNominationIds(apps, nominations)).toEqual(new Set());
  });
});

describe("rowAction", () => {
  it("returns confirmPayment for AWAITING_PAYMENT_CONFIRMATION", () => {
    expect(rowAction("APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION")).toEqual({
      kind: "action",
      action: "confirmPayment",
    });
  });

  it("returns register for PAID", () => {
    expect(rowAction("APPLICATION_STATE_PAID")).toEqual({ kind: "action", action: "register" });
  });

  it("returns a reason for SUBMITTED", () => {
    expect(rowAction("APPLICATION_STATE_SUBMITTED")).toEqual({
      kind: "reason",
      reason: "ждём отметку об оплате от бойца",
    });
  });

  it("returns a reason for REGISTERED", () => {
    expect(rowAction("APPLICATION_STATE_REGISTERED")).toEqual({
      kind: "reason",
      reason: "терминально · зарегистрирована",
    });
  });

  it("returns a reason for WITHDRAWN", () => {
    expect(rowAction("APPLICATION_STATE_WITHDRAWN")).toEqual({
      kind: "reason",
      reason: "терминально · отозвана",
    });
  });
});
