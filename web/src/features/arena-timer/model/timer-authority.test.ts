import { describe, expect, it } from "vitest";
import { apply, frameOf, onCurrentBoutChanged, type TimerState } from "./timer-authority";

const T0 = 1_700_000_000_000;

function stopped(remainingCs: number, defaultCs = 9000): TimerState {
  return { status: "STOPPED", remainingCs, referenceMs: T0, defaultCs };
}

function running(remainingCs: number, referenceMs = T0, defaultCs = 9000): TimerState {
  return { status: "RUNNING", remainingCs, referenceMs, defaultCs };
}

describe("frameOf", () => {
  it("decreases monotonically as nowMs grows for a RUNNING state", () => {
    const state = running(9000, T0);
    expect(frameOf(state, T0).remainingCs).toBe(9000);
    expect(frameOf(state, T0 + 1000).remainingCs).toBe(8900);
    expect(frameOf(state, T0 + 2000).remainingCs).toBe(8800);
  });

  it("does not change remainingCs for non-RUNNING states regardless of nowMs", () => {
    const state = stopped(4500);
    expect(frameOf(state, T0 + 60_000)).toEqual({ status: "STOPPED", remainingCs: 4500 });
  });

  it("reaches EXPIRED at 0 and does not go negative as nowMs keeps growing", () => {
    const state = running(100, T0); // 1.00s left
    expect(frameOf(state, T0 + 1000)).toEqual({ status: "EXPIRED", remainingCs: 0 });
    expect(frameOf(state, T0 + 60_000)).toEqual({ status: "EXPIRED", remainingCs: 0 });
  });
});

describe("apply — START", () => {
  it("is a no-op when remainingCs is already 0 (needs RESET first)", () => {
    const state = stopped(0);
    const next = apply(state, { kind: "START" }, T0 + 500);
    expect(next).toEqual(state);
    expect(next.status).not.toBe("RUNNING");
  });

  it("is a no-op when a RUNNING timer has already expired", () => {
    const state = running(100, T0);
    const next = apply(state, { kind: "START" }, T0 + 1000);
    expect(next.status).toBe("RUNNING"); // unchanged state returned as-is
    expect(next).toEqual(state);
  });

  it("starts a stopped/paused timer, anchoring referenceMs to nowMs", () => {
    const state = stopped(9000);
    const next = apply(state, { kind: "START" }, T0 + 5000);
    expect(next.status).toBe("RUNNING");
    expect(next.referenceMs).toBe(T0 + 5000);
    expect(next.remainingCs).toBe(9000);
  });
});

describe("apply — PAUSE", () => {
  it("captures the exact in-flight value at the moment of pausing (no jump)", () => {
    const state = running(9000, T0);
    const t1 = T0 + 1234;
    const paused = apply(state, { kind: "PAUSE" }, t1);
    expect(paused.remainingCs).toBe(frameOf(state, t1).remainingCs);
    expect(paused.status).toBe("PAUSED");
  });

  it("pausing after expiry keeps status EXPIRED at remainingCs 0", () => {
    const state = running(100, T0);
    const paused = apply(state, { kind: "PAUSE" }, T0 + 5000);
    expect(paused.status).toBe("EXPIRED");
    expect(paused.remainingCs).toBe(0);
  });

  it("resuming after a pause continues from exactly the paused value (monotonic, no jump/loss)", () => {
    const running1 = running(9000, T0);
    const t1 = T0 + 1000; // pause at 8900cs
    const paused = apply(running1, { kind: "PAUSE" }, t1);
    expect(paused.remainingCs).toBe(8900);

    const t2 = t1 + 5000; // resume 5s later, sitting idle at 8900cs
    const resumed = apply(paused, { kind: "START" }, t2);
    expect(resumed.status).toBe("RUNNING");
    // Immediately after resuming, the displayed value is exactly what it was at pause.
    expect(frameOf(resumed, t2).remainingCs).toBe(8900);
  });
});

describe("apply — RESET", () => {
  it("resets remainingCs to defaultCs and status to STOPPED", () => {
    const state = running(1200, T0, 9000);
    const next = apply(state, { kind: "RESET" }, T0 + 3000);
    expect(next.status).toBe("STOPPED");
    expect(next.remainingCs).toBe(9000);
  });
});

describe("apply — ADJUST", () => {
  it("adds seconds (positive amountSeconds) to the current exact value", () => {
    const state = stopped(4500);
    const next = apply(state, { kind: "ADJUST", amountSeconds: 5 }, T0);
    expect(next.remainingCs).toBe(5000);
  });

  it("subtracts seconds (negative amountSeconds)", () => {
    const state = stopped(4500);
    const next = apply(state, { kind: "ADJUST", amountSeconds: -2 }, T0);
    expect(next.remainingCs).toBe(4300);
  });

  it("clamps to 0 — a large negative adjust on a small remainder does not go negative", () => {
    const state = stopped(150); // 1.50s
    const next = apply(state, { kind: "ADJUST", amountSeconds: -5 }, T0);
    expect(next.remainingCs).toBe(0);
  });

  it("keeps RUNNING status and continues ticking from the new value after adjusting a running timer", () => {
    const state = running(4500, T0);
    const t1 = T0 + 1000; // 4400cs elapsed to here
    const adjusted = apply(state, { kind: "ADJUST", amountSeconds: 5 }, t1);
    expect(adjusted.status).toBe("RUNNING");
    expect(adjusted.remainingCs).toBe(4900); // 4400 + 500
    expect(adjusted.referenceMs).toBe(t1);
    // Continues ticking from the new anchor.
    expect(frameOf(adjusted, t1 + 1000).remainingCs).toBe(4800);
  });
});

describe("onCurrentBoutChanged", () => {
  it("resets to default and pauses (not stops) — start remains manual", () => {
    const state = running(3000, T0, 9000);
    const next = onCurrentBoutChanged(state, T0 + 10_000);
    expect(next.status).toBe("PAUSED");
    expect(next.remainingCs).toBe(9000);
    expect(next.referenceMs).toBe(T0 + 10_000);
  });
});
