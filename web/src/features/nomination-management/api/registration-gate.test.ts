import { describe, expect, it } from "vitest";
import type { NominationStatus } from "@/entities/nomination/lib/types";
import { canClose, canReopen } from "./registration-gate";

const ALL_STATUSES: NominationStatus[] = [
  "NOMINATION_STATUS_UNSPECIFIED",
  "NOMINATION_STATUS_OPEN",
  "NOMINATION_STATUS_CLOSED",
  "NOMINATION_STATUS_ACTIVE",
  "NOMINATION_STATUS_FINISHED",
];

describe("canClose", () => {
  // Спека 0012, FR-9/AC-12: «Закрыть приём» доступна только при OPEN.
  it.each(ALL_STATUSES)("status=%s", (status) => {
    expect(canClose(status)).toBe(status === "NOMINATION_STATUS_OPEN");
  });
});

describe("canReopen", () => {
  // Спека 0012, FR-9/AC-12/AC-16: «Открыть приём» доступна только при
  // CLOSED и отсутствии распределённых бойцов — таблица истинности по всем
  // комбинациям (status, hasDistributedFighters).
  const cases: Array<[NominationStatus, boolean, boolean]> = [
    ["NOMINATION_STATUS_UNSPECIFIED", false, false],
    ["NOMINATION_STATUS_UNSPECIFIED", true, false],
    ["NOMINATION_STATUS_OPEN", false, false],
    ["NOMINATION_STATUS_OPEN", true, false],
    ["NOMINATION_STATUS_CLOSED", false, true],
    // AC-16: закрыто вручную, но раскладка всё же началась — заблокировано.
    ["NOMINATION_STATUS_CLOSED", true, false],
    ["NOMINATION_STATUS_ACTIVE", false, false],
    ["NOMINATION_STATUS_ACTIVE", true, false],
    ["NOMINATION_STATUS_FINISHED", false, false],
    ["NOMINATION_STATUS_FINISHED", true, false],
  ];

  it.each(cases)("status=%s, hasDistributedFighters=%s → %s", (status, hasDistributed, expected) => {
    expect(canReopen(status, hasDistributed)).toBe(expected);
  });
});
