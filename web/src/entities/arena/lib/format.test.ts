import { describe, expect, it } from "vitest";
import { formatDurationLabel } from "./format";

describe("formatDurationLabel", () => {
  it("formats whole minutes as M:00", () => {
    expect(formatDurationLabel(180)).toBe("3:00");
  });

  it("formats a minute and a half", () => {
    expect(formatDurationLabel(90)).toBe("1:30");
  });

  it("formats zero seconds", () => {
    expect(formatDurationLabel(0)).toBe("0:00");
  });

  it("formats a minute and five seconds", () => {
    expect(formatDurationLabel(65)).toBe("1:05");
  });

  it("formats under a minute", () => {
    expect(formatDurationLabel(59)).toBe("0:59");
  });

  it("formats an arbitrary non-round value", () => {
    expect(formatDurationLabel(125)).toBe("2:05");
  });
});
