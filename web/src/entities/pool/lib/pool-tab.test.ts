import { describe, expect, it } from "vitest";
import { defaultPoolTab } from "./pool-tab";
import type { PoolStatus } from "./types";

describe("defaultPoolTab (спека 0061, FR-4)", () => {
  const cases: [PoolStatus, "bouts" | "standings"][] = [
    ["POOL_STATUS_UNSPECIFIED", "standings"],
    ["POOL_STATUS_NOT_READY", "standings"],
    ["POOL_STATUS_READY", "standings"],
    ["POOL_STATUS_PREPARING", "standings"],
    ["POOL_STATUS_ACTIVE", "bouts"],
    ["POOL_STATUS_FINISHED", "standings"],
  ];

  it.each(cases)("%s → %s", (status, tab) => {
    expect(defaultPoolTab(status)).toBe(tab);
  });
});
