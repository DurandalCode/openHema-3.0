import { describe, expect, it } from "vitest";
import { applyPendingStep, clearPending, type PendingScore } from "./pending-score";

describe("features/bout-board/model/pending-score applyPendingStep", () => {
  it("starts from the base score when there is no pending value yet", () => {
    const base = { scoreA: 4, scoreB: 6 };
    expect(applyPendingStep(null, base, "A", 1)).toEqual({ scoreA: 5, scoreB: 6 });
  });

  it("accumulates on top of the previous pending value, not the base again", () => {
    const base = { scoreA: 4, scoreB: 6 };
    let pending: PendingScore = null;
    pending = applyPendingStep(pending, base, "A", 1);
    pending = applyPendingStep(pending, base, "A", 1);
    expect(pending).toEqual({ scoreA: 6, scoreB: 6 });
  });

  // AC-13: "+1" twice and "+2" collapse into one final value, not three
  // separate steps.
  it("collapses three offline steps into the same single absolute value (AC-13)", () => {
    const base = { scoreA: 4, scoreB: 6 };

    let chained: PendingScore = null;
    chained = applyPendingStep(chained, base, "A", 1);
    chained = applyPendingStep(chained, base, "A", 1);
    chained = applyPendingStep(chained, base, "A", 2);

    const single = applyPendingStep(null, base, "A", 4);

    expect(chained).toEqual(single);
    expect(chained).toEqual({ scoreA: 8, scoreB: 6 });
  });

  it("tracks each side independently", () => {
    const base = { scoreA: 4, scoreB: 6 };
    let pending: PendingScore = null;
    pending = applyPendingStep(pending, base, "A", 1);
    pending = applyPendingStep(pending, base, "B", 2);
    expect(pending).toEqual({ scoreA: 5, scoreB: 8 });
  });

  it("clamps a side to 0, same as applyScoreStep", () => {
    const base = { scoreA: 1, scoreB: 0 };
    const pending = applyPendingStep(null, base, "B", -3);
    expect(pending).toEqual({ scoreA: 1, scoreB: 0 });
  });
});

describe("features/bout-board/model/pending-score clearPending", () => {
  it("returns null", () => {
    expect(clearPending()).toBeNull();
  });
});
