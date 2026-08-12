import { describe, expect, it } from "vitest";
import {
  dateToIso,
  fromLocalInputValue,
  parseIsoToDate,
  toLocalInputValue,
} from "./datetime";

describe("datetime (FR-12)", () => {
  describe("toLocalInputValue / fromLocalInputValue round-trip", () => {
    it("round-trips an ISO instant with whole minutes through the field value", () => {
      const iso = "2026-08-12T14:30:00.000Z";
      const local = toLocalInputValue(iso);
      const back = fromLocalInputValue(local);

      expect(back).not.toBeNull();
      expect(new Date(back as string).getTime()).toBe(new Date(iso).getTime());
    });

    it("round-trips a field value back into the same field value via ISO", () => {
      const local = "2026-08-12T09:15";
      const iso = fromLocalInputValue(local);
      expect(iso).not.toBeNull();
      expect(toLocalInputValue(iso)).toBe(local);
    });
  });

  describe("empty input", () => {
    it("toLocalInputValue returns an empty string for null/undefined/empty ISO", () => {
      expect(toLocalInputValue(null)).toBe("");
      expect(toLocalInputValue(undefined)).toBe("");
      expect(toLocalInputValue("")).toBe("");
    });

    it("fromLocalInputValue returns null for an empty field value", () => {
      expect(fromLocalInputValue("")).toBeNull();
    });
  });

  describe("invalid input", () => {
    it("toLocalInputValue returns an empty string for an invalid ISO string", () => {
      expect(toLocalInputValue("not-a-date")).toBe("");
    });

    it("fromLocalInputValue returns null for an invalid field value", () => {
      expect(fromLocalInputValue("not-a-date")).toBeNull();
    });
  });

  describe("parseIsoToDate / dateToIso", () => {
    it("parses a valid ISO string into a Date", () => {
      const date = parseIsoToDate("2026-08-12T14:30:00.000Z");
      expect(date).not.toBeNull();
      expect((date as Date).getTime()).toBe(
        new Date("2026-08-12T14:30:00.000Z").getTime(),
      );
    });

    it("returns null for empty or invalid input", () => {
      expect(parseIsoToDate(null)).toBeNull();
      expect(parseIsoToDate(undefined)).toBeNull();
      expect(parseIsoToDate("")).toBeNull();
      expect(parseIsoToDate("not-a-date")).toBeNull();
    });

    it("dateToIso round-trips a Date through parseIsoToDate", () => {
      const date = new Date("2026-08-12T14:30:00.000Z");
      const iso = dateToIso(date);
      expect(parseIsoToDate(iso)?.getTime()).toBe(date.getTime());
    });
  });
});
