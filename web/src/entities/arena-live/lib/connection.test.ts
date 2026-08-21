import { describe, expect, it } from "vitest";
import { connectionLabel, isOffline } from "./connection";

describe("entities/arena-live/lib/connection connectionLabel", () => {
  it("formats seconds under a minute (macet 21b: «Связь потеряна · 12 секунд»)", () => {
    expect(connectionLabel(12_000)).toBe("Связь потеряна · 12 секунд");
  });

  it("declines 1 second correctly", () => {
    expect(connectionLabel(1_000)).toBe("Связь потеряна · 1 секунду");
  });

  it("declines 2..4 seconds correctly", () => {
    expect(connectionLabel(2_000)).toBe("Связь потеряна · 2 секунды");
    expect(connectionLabel(3_000)).toBe("Связь потеряна · 3 секунды");
  });

  it("declines 11..14 seconds as секунд (genitive plural exception)", () => {
    expect(connectionLabel(11_000)).toBe("Связь потеряна · 11 секунд");
    expect(connectionLabel(14_000)).toBe("Связь потеряна · 14 секунд");
  });

  it("switches to minutes at the 60s boundary", () => {
    expect(connectionLabel(60_000)).toBe("Связь потеряна · 1 минуту");
    expect(connectionLabel(59_999)).toBe("Связь потеряна · 59 секунд");
  });

  it("declines minutes correctly", () => {
    expect(connectionLabel(120_000)).toBe("Связь потеряна · 2 минуты");
    expect(connectionLabel(300_000)).toBe("Связь потеряна · 5 минут");
  });

  it("floors partial seconds/minutes", () => {
    expect(connectionLabel(12_900)).toBe("Связь потеряна · 12 секунд");
    expect(connectionLabel(125_000)).toBe("Связь потеряна · 2 минуты");
  });
});

describe("entities/arena-live/lib/connection isOffline", () => {
  it("is true only for lost", () => {
    expect(isOffline("lost")).toBe(true);
    expect(isOffline("live")).toBe(false);
  });
});
