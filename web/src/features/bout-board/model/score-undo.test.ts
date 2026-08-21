import { describe, expect, it } from "vitest";
import { pushStep, undoTarget, type ScoreUndoState } from "./score-undo";

describe("features/bout-board/model/score-undo pushStep", () => {
  it("labels a positive step (AC-8: «Отменить +1 красному»)", () => {
    const state = pushStep(null, "bout-1", { scoreA: 3, scoreB: 6 }, "A", 1, "красному");
    expect(state?.label).toBe("Отменить +1 красному");
  });

  it("labels a negative step with its own sign", () => {
    const state = pushStep(null, "bout-1", { scoreA: 3, scoreB: 6 }, "B", -2, "синему");
    expect(state?.label).toBe("Отменить -2 синему");
  });

  it("stores the score from before the step, for undoTarget to return to", () => {
    const state = pushStep(null, "bout-1", { scoreA: 3, scoreB: 6 }, "A", 1, "красному");
    expect(state).toEqual({
      boutId: "bout-1",
      previousScoreA: 3,
      previousScoreB: 6,
      label: "Отменить +1 красному",
    });
  });

  it("overwrites the previous step instead of accumulating history", () => {
    let state: ScoreUndoState = null;
    state = pushStep(state, "bout-1", { scoreA: 3, scoreB: 6 }, "A", 1, "красному");
    state = pushStep(state, "bout-1", { scoreA: 4, scoreB: 6 }, "A", 2, "красному");
    expect(state).toEqual({
      boutId: "bout-1",
      previousScoreA: 4,
      previousScoreB: 6,
      label: "Отменить +2 красному",
    });
  });
});

describe("features/bout-board/model/score-undo undoTarget", () => {
  it("returns the previous absolute score for the current bout (AC-8)", () => {
    const state = pushStep(null, "bout-1", { scoreA: 3, scoreB: 6 }, "A", 1, "красному");
    expect(undoTarget(state, "bout-1")).toEqual({ scoreA: 3, scoreB: 6 });
  });

  it("returns null when there is no undo state (no step taken yet)", () => {
    expect(undoTarget(null, "bout-1")).toBeNull();
  });

  it("returns null when the bout has changed since the step (FR-19: reset on bout switch)", () => {
    const state = pushStep(null, "bout-1", { scoreA: 3, scoreB: 6 }, "A", 1, "красному");
    expect(undoTarget(state, "bout-2")).toBeNull();
  });
});
