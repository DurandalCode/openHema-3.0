import { describe, expect, it } from "vitest";
import {
  fighterStatusLabel,
  importOutcomeLabel,
  importRowErrorLabel,
  originLabel,
  participationLabel,
  withdrawalReasonLabel,
} from "./labels";

describe("fighterStatusLabel", () => {
  it("returns Активен for FIGHTER_STATUS_ACTIVE", () => {
    expect(fighterStatusLabel("FIGHTER_STATUS_ACTIVE")).toBe("Активен");
  });

  it("returns Выбыл for FIGHTER_STATUS_WITHDRAWN", () => {
    expect(fighterStatusLabel("FIGHTER_STATUS_WITHDRAWN")).toBe("Выбыл");
  });

  it("returns Объединён for FIGHTER_STATUS_MERGED (spec 0040, FR-10)", () => {
    expect(fighterStatusLabel("FIGHTER_STATUS_MERGED")).toBe("Объединён");
  });
});

describe("withdrawalReasonLabel", () => {
  it("returns травма for WITHDRAWAL_REASON_INJURY", () => {
    expect(withdrawalReasonLabel("WITHDRAWAL_REASON_INJURY")).toBe("травма");
  });

  it("returns бан for WITHDRAWAL_REASON_BAN", () => {
    expect(withdrawalReasonLabel("WITHDRAWAL_REASON_BAN")).toBe("бан");
  });

  it("returns иное for WITHDRAWAL_REASON_OTHER", () => {
    expect(withdrawalReasonLabel("WITHDRAWAL_REASON_OTHER")).toBe("иное");
  });

  it("returns null for WITHDRAWAL_REASON_UNSPECIFIED (FR-3)", () => {
    expect(withdrawalReasonLabel("WITHDRAWAL_REASON_UNSPECIFIED")).toBeNull();
  });
});

describe("participationLabel", () => {
  it("returns участвует for PARTICIPATION_STATUS_ACTIVE", () => {
    expect(participationLabel("PARTICIPATION_STATUS_ACTIVE")).toBe("участвует");
  });

  it("returns снят for PARTICIPATION_STATUS_REMOVED", () => {
    expect(participationLabel("PARTICIPATION_STATUS_REMOVED")).toBe("снят");
  });
});

describe("originLabel", () => {
  it("returns из заявки for true (FR-5)", () => {
    expect(originLabel(true)).toBe("из заявки");
  });

  it("returns заведён вручную for false", () => {
    expect(originLabel(false)).toBe("заведён вручную");
  });
});

describe("importOutcomeLabel (spec 0049, FR-3)", () => {
  it("names every outcome of an import row", () => {
    expect(importOutcomeLabel("IMPORT_ROW_OUTCOME_CREATED")).toBe("новый боец");
    expect(importOutcomeLabel("IMPORT_ROW_OUTCOME_UPDATED")).toBe("дополнение");
    expect(importOutcomeLabel("IMPORT_ROW_OUTCOME_SKIPPED")).toBe("пропуск");
    expect(importOutcomeLabel("IMPORT_ROW_OUTCOME_REJECTED")).toBe("ошибка");
  });

  it("returns a dash for an unknown outcome", () => {
    expect(importOutcomeLabel("IMPORT_ROW_OUTCOME_UNSPECIFIED")).toBe("—");
  });
});

describe("importRowErrorLabel (spec 0049, FR-5/FR-6/FR-8a)", () => {
  it("names every rejection reason", () => {
    expect(importRowErrorLabel("IMPORT_ROW_ERROR_EMPTY_NAME")).toBe("пустое имя");
    expect(importRowErrorLabel("IMPORT_ROW_ERROR_FIGHTER_WITHDRAWN")).toBe(
      "боец выведен с турнира",
    );
  });

  it("appends the unrecognised nomination title itself (AC-3)", () => {
    expect(importRowErrorLabel("IMPORT_ROW_ERROR_UNKNOWN_NOMINATION", "Копьё")).toBe(
      "неизвестная номинация: Копьё",
    );
    expect(importRowErrorLabel("IMPORT_ROW_ERROR_UNKNOWN_NOMINATION")).toBe(
      "неизвестная номинация",
    );
  });

  it("returns null when the row was not rejected — nothing to show", () => {
    expect(importRowErrorLabel("IMPORT_ROW_ERROR_UNSPECIFIED")).toBeNull();
  });
});
