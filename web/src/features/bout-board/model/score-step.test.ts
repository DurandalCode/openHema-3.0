import { describe, expect, it } from "vitest";
import { applyScoreStep } from "./score-step";

describe("features/bout-board/model/score-step applyScoreStep", () => {
  it("adds a positive delta", () => {
    expect(applyScoreStep(0, 5)).toBe(5);
  });

  it("subtracts a negative delta", () => {
    expect(applyScoreStep(5, -3)).toBe(2);
  });

  it("clamps to 0 when a negative step would go below zero", () => {
    expect(applyScoreStep(1, -2)).toBe(0);
  });

  it("does not go negative from 0", () => {
    expect(applyScoreStep(0, -1)).toBe(0);
  });

  // AC-2a: fighter A +5, +2, −3 from 0 → 4
  it("reproduces AC-2a fighter A sequence (0 -> +5 -> +2 -> -3 = 4)", () => {
    let score = 0;
    score = applyScoreStep(score, 5);
    score = applyScoreStep(score, 2);
    score = applyScoreStep(score, -3);
    expect(score).toBe(4);
  });

  // AC-2a: fighter B +1, −2 from 0 → 0 (clamped, not negative)
  it("reproduces AC-2a fighter B sequence (0 -> +1 -> -2 = 0, clamped)", () => {
    let score = 0;
    score = applyScoreStep(score, 1);
    score = applyScoreStep(score, -2);
    expect(score).toBe(0);
  });

  it("supports all quick-step magnitudes (1/2/3/5)", () => {
    expect(applyScoreStep(10, 1)).toBe(11);
    expect(applyScoreStep(10, -1)).toBe(9);
    expect(applyScoreStep(10, 2)).toBe(12);
    expect(applyScoreStep(10, -2)).toBe(8);
    expect(applyScoreStep(10, 3)).toBe(13);
    expect(applyScoreStep(10, -3)).toBe(7);
    expect(applyScoreStep(10, 5)).toBe(15);
    expect(applyScoreStep(10, -5)).toBe(5);
  });
});
