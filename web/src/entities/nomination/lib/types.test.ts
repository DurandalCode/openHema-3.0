import { describe, expect, it } from "vitest";
import { nominationStatusLabel, type NominationStatus } from "./types";

describe("entities/nomination nominationStatusLabel", () => {
  const cases: Array<[NominationStatus, string]> = [
    ["NOMINATION_STATUS_UNSPECIFIED", "—"],
    ["NOMINATION_STATUS_OPEN", "приём заявок открыт"],
    ["NOMINATION_STATUS_CLOSED", "приём заявок завершён"],
    ["NOMINATION_STATUS_ACTIVE", "идёт"],
    ["NOMINATION_STATUS_FINISHED", "завершена"],
  ];

  for (const [status, label] of cases) {
    it(`labels ${status} as "${label}"`, () => {
      expect(nominationStatusLabel(status)).toBe(label);
    });
  }
});
