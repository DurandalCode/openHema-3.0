import { describe, expect, it } from "vitest";
import { nominationStatusLabel, nominationStatusTag, type NominationStatus } from "./types";

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

describe("entities/nomination nominationStatusTag", () => {
  const cases: Array<[NominationStatus, string]> = [
    ["NOMINATION_STATUS_UNSPECIFIED", "—"],
    ["NOMINATION_STATUS_OPEN", "Приём открыт"],
    ["NOMINATION_STATUS_CLOSED", "Приём закрыт"],
    ["NOMINATION_STATUS_ACTIVE", "Бои идут"],
    ["NOMINATION_STATUS_FINISHED", "Завершена"],
  ];

  for (const [status, tag] of cases) {
    it(`tags ${status} as "${tag}"`, () => {
      expect(nominationStatusTag(status)).toBe(tag);
    });
  }
});
