import { describe, expect, it } from "vitest";
import { outcomeOf } from "./types";

describe("entities/pool/lib/types outcomeOf", () => {
  it("returns 'A' when fighter A has more points (AC-2)", () => {
    expect(outcomeOf(5, 3)).toBe("A");
  });

  it("returns 'B' when fighter B has more points", () => {
    expect(outcomeOf(3, 5)).toBe("B");
  });

  it("returns 'draw' when scores are equal (AC-3)", () => {
    expect(outcomeOf(4, 4)).toBe("draw");
  });

  it("returns 'draw' for 0:0 (not started bout)", () => {
    expect(outcomeOf(0, 0)).toBe("draw");
  });
});
