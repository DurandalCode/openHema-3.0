import { describe, expect, it } from "vitest";
import { applyFrame, frameOf, smoothDisplay } from "./timer-follower";

const T0 = 1_700_000_000_000;

describe("applyFrame", () => {
  it("compensates a positive serverOffsetMs (server clock ahead of client)", () => {
    // Server clock is 300ms ahead of the client's Date.now() (offset = server - client).
    const serverOffsetMs = 300;
    const frame = { status: "RUNNING" as const, remainingCs: 9000, sampledUnixMs: T0, defaultCs: 9000 };
    const state = applyFrame(frame, serverOffsetMs, T0);
    // referenceMs = sampledUnixMs - offset → local timeline.
    expect(state.referenceMs).toBe(T0 - 300);
    // 300ms have "already elapsed" locally by the time we apply the frame at T0.
    expect(frameOf(state, T0).remainingCs).toBe(8970); // 9000 - 30cs
  });

  it("compensates a negative serverOffsetMs (server clock behind the client)", () => {
    const serverOffsetMs = -200;
    const frame = { status: "RUNNING" as const, remainingCs: 9000, sampledUnixMs: T0, defaultCs: 9000 };
    const state = applyFrame(frame, serverOffsetMs, T0);
    // referenceMs = sampledUnixMs - offset = T0 - (-200) = T0 + 200.
    expect(state.referenceMs).toBe(T0 + 200);
    // referenceMs sits 200ms in the "local future" relative to nowMs=T0, so
    // elapsedCs is negative (-20) — frameOf's generic formula is symmetric.
    expect(frameOf(state, T0).remainingCs).toBe(9020);
  });

  it("carries status/remainingCs/defaultCs through unchanged for non-RUNNING frames", () => {
    const frame = { status: "PAUSED" as const, remainingCs: 4500, sampledUnixMs: T0, defaultCs: 9000 };
    const state = applyFrame(frame, 0, T0 + 10_000);
    expect(frameOf(state, T0 + 10_000)).toEqual({ status: "PAUSED", remainingCs: 4500 });
  });
});

describe("smoothDisplay", () => {
  it("moves monotonically toward the target", () => {
    let displayed = 9000;
    const target = 8900;
    const steps = [16, 16, 16, 16, 16]; // ~5 frames at 60fps
    let lastDiff = Math.abs(target - displayed);
    for (const dt of steps) {
      displayed = smoothDisplay(displayed, target, dt, 9000);
      const diff = Math.abs(target - displayed);
      expect(diff).toBeLessThanOrEqual(lastDiff);
      lastDiff = diff;
    }
  });

  it("does not overshoot the target even with a large dt", () => {
    // displayed=9000 → target=8900 (below), a huge dt should land at/near
    // the target, never past it in the direction of travel.
    const next = smoothDisplay(9000, 8900, 5000, 9000);
    expect(next).toBeGreaterThanOrEqual(8900);
    expect(next).toBeLessThanOrEqual(9000);
  });

  it("eventually converges to the target over enough frames", () => {
    let displayed = 9000;
    const target = 8900;
    for (let i = 0; i < 200; i += 1) {
      displayed = smoothDisplay(displayed, target, 16, 9000);
    }
    expect(displayed).toBeCloseTo(target, 0);
  });

  it("returns the target immediately on a large jump (> defaultCs/2) — e.g. bout change/RESET", () => {
    // defaultCs = 9000 → half = 4500; jump of 5000 exceeds it.
    const next = smoothDisplay(9000, 4000, 16, 9000);
    expect(next).toBe(4000);
  });

  it("returns displayed unchanged when already at target", () => {
    expect(smoothDisplay(5000, 5000, 16, 9000)).toBe(5000);
  });
});
