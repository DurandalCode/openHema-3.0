import { describe, expect, it } from "vitest";
import { resolveDrop } from "./drop-action";

describe("resolveDrop", () => {
  it("seeds when dragging from unassigned into an empty slot", () => {
    expect(resolveDrop("f1", null, 3)).toEqual({ type: "seed", fighterId: "f1", slot: 3 });
  });

  it("seeds when dragging an already-seeded fighter into another slot (server resolves swap/reject)", () => {
    expect(resolveDrop("f1", 1, 3)).toEqual({ type: "seed", fighterId: "f1", slot: 3 });
  });

  it("clears the source slot when dragging back to unassigned", () => {
    expect(resolveDrop("f1", 2, null)).toEqual({ type: "clear", slot: 2 });
  });

  it("is a no-op when dragging from unassigned back to unassigned", () => {
    expect(resolveDrop("f1", null, null)).toEqual({ type: "noop" });
  });

  it("is a no-op when dropped on the same slot it came from", () => {
    expect(resolveDrop("f1", 4, 4)).toEqual({ type: "noop" });
  });

  it("is a no-op when fighterId is missing (drop outside a draggable)", () => {
    expect(resolveDrop(undefined, null, 3)).toEqual({ type: "noop" });
  });
});
