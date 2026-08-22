import { describe, expect, it } from "vitest";
import { applicationsSummary } from "./summary";
import type { NominationParticipants } from "./types";

function participants(overrides: Partial<NominationParticipants>): NominationParticipants {
  return {
    participants: [],
    appliedCount: 0,
    confirmedCount: 0,
    fighterCapacity: null,
    ...overrides,
  };
}

describe("entities/application/lib/summary applicationsSummary", () => {
  it("returns zeros and null capacity for an empty record", () => {
    expect(applicationsSummary({})).toEqual({
      applied: 0,
      confirmed: 0,
      capacity: null,
    });
  });

  it("sums applied/confirmed across nominations", () => {
    const result = applicationsSummary({
      n1: participants({ appliedCount: 19, confirmedCount: 15, fighterCapacity: 24 }),
      n2: participants({ appliedCount: 5, confirmedCount: 3, fighterCapacity: null }),
    });
    expect(result.applied).toBe(24);
    expect(result.confirmed).toBe(18);
  });

  it("sums capacity only across nominations where it is set (AC-3/AC-4)", () => {
    const result = applicationsSummary({
      withCap: participants({ appliedCount: 19, confirmedCount: 15, fighterCapacity: 24 }),
      withoutCap: participants({ appliedCount: 5, confirmedCount: 3, fighterCapacity: null }),
    });
    expect(result.capacity).toBe(24);
  });

  it("returns null capacity when no nomination has one set", () => {
    const result = applicationsSummary({
      n1: participants({ appliedCount: 5, confirmedCount: 2, fighterCapacity: null }),
      n2: participants({ appliedCount: 3, confirmedCount: 1, fighterCapacity: null }),
    });
    expect(result.capacity).toBeNull();
  });

  it("gives a result the component can use to decide not to render (nothing to sum)", () => {
    // FR-5: блок сводки не показывается, если ни у одной номинации нет ни
    // заявок, ни заданной вместимости. Решение: applicationsSummary не
    // возвращает отдельный булев флаг — компонент проверяет сам:
    // applied === 0 && confirmed === 0 && capacity === null.
    const result = applicationsSummary({
      n1: participants({ appliedCount: 0, confirmedCount: 0, fighterCapacity: null }),
    });
    expect(result).toEqual({ applied: 0, confirmed: 0, capacity: null });
    const nothingToShow =
      result.applied === 0 && result.confirmed === 0 && result.capacity === null;
    expect(nothingToShow).toBe(true);
  });
});
