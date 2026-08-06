import { describe, expect, it } from "vitest";
import type { StageBuildTie, TieResolution } from "@/entities/stage/lib/types";
import {
  allTiesResolved,
  clearTieResolution,
  findTieResolution,
  isTieResolved,
  setTieResolution,
  tieKey,
  toggleTieContender,
} from "./tie-resolution";

function tie(overrides: Partial<StageBuildTie> = {}): StageBuildTie {
  return {
    sourcePoolId: "p1",
    groupLabel: "Группа 1",
    place: 2,
    contenders: [
      { fighterId: "f1", name: "A", club: "" },
      { fighterId: "f2", name: "B", club: "" },
      { fighterId: "f3", name: "C", club: "" },
    ],
    slotsLeft: 1,
    ...overrides,
  };
}

describe("tieKey", () => {
  it("combines sourcePoolId and place", () => {
    expect(tieKey({ sourcePoolId: "p1", place: 2 })).toBe("p1::2");
  });

  it("distinguishes an empty sourcePoolId (overall-order tie, FR-5)", () => {
    expect(tieKey({ sourcePoolId: "", place: 8 })).toBe("::8");
  });
});

describe("toggleTieContender", () => {
  it("adds the first click as the sole entry when nothing is resolved yet", () => {
    const next = toggleTieContender([], tie(), "f1");
    expect(next).toEqual([{ sourcePoolId: "p1", place: 2, fighterIds: ["f1"] }]);
  });

  it("appends subsequent clicks in click order (FR-22: order = priority)", () => {
    const t = tie({ slotsLeft: 2 });
    let resolutions: TieResolution[] = [];
    resolutions = toggleTieContender(resolutions, t, "f2");
    resolutions = toggleTieContender(resolutions, t, "f1");
    expect(findTieResolution(resolutions, t)?.fighterIds).toEqual(["f2", "f1"]);
  });

  it("removes a fighter on a second click of the same fighter", () => {
    const t = tie();
    let resolutions: TieResolution[] = [];
    resolutions = toggleTieContender(resolutions, t, "f1");
    resolutions = toggleTieContender(resolutions, t, "f1");
    expect(findTieResolution(resolutions, t)).toBeUndefined();
  });

  it("removing one of several selections keeps the remaining order", () => {
    const t = tie({ slotsLeft: 2 });
    let resolutions: TieResolution[] = [];
    resolutions = toggleTieContender(resolutions, t, "f2");
    resolutions = toggleTieContender(resolutions, t, "f1");
    resolutions = toggleTieContender(resolutions, t, "f2");
    expect(findTieResolution(resolutions, t)?.fighterIds).toEqual(["f1"]);
  });

  it("ignores a click past slotsLeft (must remove one first)", () => {
    const t = tie({ slotsLeft: 1 });
    let resolutions: TieResolution[] = [];
    resolutions = toggleTieContender(resolutions, t, "f1");
    resolutions = toggleTieContender(resolutions, t, "f2");
    expect(findTieResolution(resolutions, t)?.fighterIds).toEqual(["f1"]);
  });

  it("does not cross-contaminate independent ties (different sourcePoolId/place)", () => {
    const tieA = tie({ sourcePoolId: "p1", place: 2 });
    const tieB = tie({ sourcePoolId: "p2", place: 2 });
    let resolutions: TieResolution[] = [];
    resolutions = toggleTieContender(resolutions, tieA, "f1");
    resolutions = toggleTieContender(resolutions, tieB, "f9");
    expect(findTieResolution(resolutions, tieA)?.fighterIds).toEqual(["f1"]);
    expect(findTieResolution(resolutions, tieB)?.fighterIds).toEqual(["f9"]);
  });
});

describe("setTieResolution / clearTieResolution", () => {
  it("replaces an existing resolution for the same tie key", () => {
    const t = tie();
    let resolutions = setTieResolution([], { sourcePoolId: "p1", place: 2, fighterIds: ["f1"] });
    resolutions = setTieResolution(resolutions, { sourcePoolId: "p1", place: 2, fighterIds: ["f2"] });
    expect(resolutions).toHaveLength(1);
    expect(findTieResolution(resolutions, t)?.fighterIds).toEqual(["f2"]);
  });

  it("clearTieResolution removes only the matching tie", () => {
    let resolutions: TieResolution[] = [
      { sourcePoolId: "p1", place: 2, fighterIds: ["f1"] },
      { sourcePoolId: "p2", place: 2, fighterIds: ["f9"] },
    ];
    resolutions = clearTieResolution(resolutions, { sourcePoolId: "p1", place: 2 });
    expect(resolutions).toEqual([{ sourcePoolId: "p2", place: 2, fighterIds: ["f9"] }]);
  });
});

describe("isTieResolved / allTiesResolved", () => {
  it("a tie is resolved once exactly slotsLeft fighters are ordered", () => {
    const t = tie({ slotsLeft: 1 });
    expect(isTieResolved([], t)).toBe(false);
    const resolutions = toggleTieContender([], t, "f1");
    expect(isTieResolved(resolutions, t)).toBe(true);
  });

  it("allTiesResolved is false until every tie in the list is resolved", () => {
    const tieA = tie({ sourcePoolId: "p1", place: 2, slotsLeft: 1 });
    const tieB = tie({ sourcePoolId: "p2", place: 2, slotsLeft: 1 });
    let resolutions: TieResolution[] = [];
    expect(allTiesResolved([tieA, tieB], resolutions)).toBe(false);

    resolutions = toggleTieContender(resolutions, tieA, "f1");
    expect(allTiesResolved([tieA, tieB], resolutions)).toBe(false);

    resolutions = toggleTieContender(resolutions, tieB, "f9");
    expect(allTiesResolved([tieA, tieB], resolutions)).toBe(true);
  });

  it("an empty ties list is vacuously all-resolved", () => {
    expect(allTiesResolved([], [])).toBe(true);
  });
});
