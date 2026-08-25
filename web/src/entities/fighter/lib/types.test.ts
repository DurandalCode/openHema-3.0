import { describe, expect, it } from "vitest";
import { hasLinkedAccount, isMergedFighter } from "./types";

describe("hasLinkedAccount", () => {
  it("returns true when linkedAccountId is non-empty (FR-8)", () => {
    expect(hasLinkedAccount({ linkedAccountId: "user-1" })).toBe(true);
  });

  it("returns false when linkedAccountId is empty", () => {
    expect(hasLinkedAccount({ linkedAccountId: "" })).toBe(false);
  });
});

describe("isMergedFighter", () => {
  it("returns true for FIGHTER_STATUS_MERGED (FR-10)", () => {
    expect(isMergedFighter("FIGHTER_STATUS_MERGED")).toBe(true);
  });

  it("returns false for FIGHTER_STATUS_ACTIVE", () => {
    expect(isMergedFighter("FIGHTER_STATUS_ACTIVE")).toBe(false);
  });

  it("returns false for FIGHTER_STATUS_WITHDRAWN", () => {
    expect(isMergedFighter("FIGHTER_STATUS_WITHDRAWN")).toBe(false);
  });
});
