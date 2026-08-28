import { describe, expect, it } from "vitest";
import type { Fighter, Participation } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { addableNominations, clubOptions, sortFighters } from "./select-fighters";

function participation(nominationId: string, status: Participation["status"] = "PARTICIPATION_STATUS_ACTIVE"): Participation {
  return { nominationId, status };
}

function fighter(overrides: Partial<Fighter>): Fighter {
  return {
    id: "f1",
    tournamentId: "t1",
    name: "Иван Петров",
    club: "Клинок Севера",
    status: "FIGHTER_STATUS_ACTIVE",
    withdrawalReason: "WITHDRAWAL_REASON_UNSPECIFIED",
    participations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fromApplication: false,
    linkedAccountId: "",
    linkedAccountDisplayName: "",
    mergedIntoId: "",
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

describe("sortFighters", () => {
  it("orders active fighters before withdrawn ones (FR-6/AC-1)", () => {
    const active = fighter({ id: "active", name: "Борис", status: "FIGHTER_STATUS_ACTIVE" });
    const withdrawn = fighter({ id: "withdrawn", name: "Анна", status: "FIGHTER_STATUS_WITHDRAWN" });

    const sorted = sortFighters([withdrawn, active]);

    expect(sorted.map((f) => f.id)).toEqual(["active", "withdrawn"]);
  });

  it("orders by name within each status group", () => {
    const b = fighter({ id: "b", name: "Борис" });
    const a = fighter({ id: "a", name: "Анна" });

    const sorted = sortFighters([b, a]);

    expect(sorted.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const list = [fighter({ id: "a" }), fighter({ id: "b", status: "FIGHTER_STATUS_WITHDRAWN" })];
    const copy = [...list];
    sortFighters(list);
    expect(list).toEqual(copy);
  });
});

describe("clubOptions", () => {
  it("returns a sorted list of distinct non-empty clubs and a hasNoClub flag", () => {
    const fighters = [
      fighter({ id: "1", club: "Стальной Клуб" }),
      fighter({ id: "2", club: "Клинок Севера" }),
      fighter({ id: "3", club: "Клинок Севера" }),
      fighter({ id: "4", club: "" }),
    ];

    expect(clubOptions(fighters)).toEqual({
      clubs: ["Клинок Севера", "Стальной Клуб"],
      hasNoClub: true,
    });
  });

  it("hasNoClub is false when every fighter has a club", () => {
    const fighters = [fighter({ id: "1", club: "Клинок Севера" })];
    expect(clubOptions(fighters).hasNoClub).toBe(false);
  });
});

describe("addableNominations", () => {
  it("excludes nominations where the fighter already has an active participation (AC-9)", () => {
    const f = fighter({ participations: [participation("sabre")] });
    const nominations = [
      nomination({ id: "sabre", title: "Сабля" }),
      nomination({ id: "longsword", title: "Длинный меч" }),
    ];

    expect(addableNominations(f, nominations).map((n) => n.id)).toEqual(["longsword"]);
  });

  it("includes a nomination where participation was removed (not active)", () => {
    const f = fighter({ participations: [participation("sabre", "PARTICIPATION_STATUS_REMOVED")] });
    const nominations = [nomination({ id: "sabre", title: "Сабля" })];

    expect(addableNominations(f, nominations).map((n) => n.id)).toEqual(["sabre"]);
  });
});
