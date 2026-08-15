import { describe, expect, it } from "vitest";
import type { StageBuildPreview } from "@/entities/stage/lib/types";
import { buildBlockedReason } from "./build-gate";

function fighter(id: string, name: string) {
  return { fighterId: id, name, club: "" };
}

function preview(overrides: Partial<StageBuildPreview> = {}): StageBuildPreview {
  return {
    entries: [],
    unselected: [],
    capacity: 8,
    ties: [],
    overlaps: [],
    sourceUnfinishedBouts: 0,
    ...overrides,
  };
}

describe("buildBlockedReason", () => {
  it("returns null when there are no unresolved ties and no overlaps", () => {
    expect(buildBlockedReason(preview())).toBeNull();
  });

  it("explains unresolved ties", () => {
    const result = buildBlockedReason(
      preview({
        ties: [
          {
            sourcePoolId: "p1",
            groupLabel: "Группа 1",
            place: 2,
            contenders: [fighter("f1", "A"), fighter("f2", "B")],
            slotsLeft: 1,
          },
        ],
      }),
    );
    expect(result).toBe("пока есть неразрешённые дележи");
  });

  it("explains overlaps", () => {
    const result = buildBlockedReason(preview({ overlaps: [fighter("f9", "Петров")] }));
    expect(result).toBe("пока есть пересечение веток");
  });

  it("prioritizes overlaps deterministically when both ties and overlaps are present", () => {
    const result = buildBlockedReason(
      preview({
        overlaps: [fighter("f9", "Петров")],
        ties: [
          {
            sourcePoolId: "p1",
            groupLabel: "Группа 1",
            place: 2,
            contenders: [fighter("f1", "A"), fighter("f2", "B")],
            slotsLeft: 1,
          },
        ],
      }),
    );
    expect(result).toBe("пока есть пересечение веток");
  });

  it("does not block on an unfinished source (AC-10) — that warning is orthogonal to this gate", () => {
    expect(buildBlockedReason(preview({ sourceUnfinishedBouts: 3 }))).toBeNull();
  });

  it("treats a tie with zero remaining slots as already resolved", () => {
    const result = buildBlockedReason(
      preview({
        ties: [
          {
            sourcePoolId: "p1",
            groupLabel: "Группа 1",
            place: 2,
            contenders: [fighter("f1", "A")],
            slotsLeft: 0,
          },
        ],
      }),
    );
    expect(result).toBeNull();
  });
});
