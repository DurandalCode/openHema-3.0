import { describe, expect, it } from "vitest";
import {
  emptyNominationResults,
  formatPlace,
  hasPlaces,
  podium,
  type NominationResultEntry,
  type NominationResultsSection,
} from "./types";

function entry(overrides: Partial<NominationResultEntry>): NominationResultEntry {
  return {
    placeFrom: 1,
    placeTo: 1,
    fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
    originLabel: "Чемпион",
    ...overrides,
  };
}

function section(overrides: Partial<NominationResultsSection>): NominationResultsSection {
  return {
    stageId: "stage-1",
    stageTitle: "Плейофф",
    stageType: "STAGE_TYPE_BRACKET",
    finished: true,
    entries: [],
    placesFromOverallOrder: false,
    ...overrides,
  };
}

describe("entities/nomination-results formatPlace", () => {
  it("renders a single place without a dash", () => {
    expect(formatPlace(entry({ placeFrom: 5, placeTo: 5 }))).toBe("5");
  });

  it("renders a range with an en dash", () => {
    expect(formatPlace(entry({ placeFrom: 5, placeTo: 8 }))).toBe("5–8");
  });
});

describe("entities/nomination-results podium", () => {
  it("includes both rows of a split 3-4 range and excludes 5-8 (AC-6/AC-7 style)", () => {
    const s = section({
      entries: [
        entry({ placeFrom: 1, placeTo: 1 }),
        entry({ placeFrom: 2, placeTo: 2 }),
        entry({ placeFrom: 3, placeTo: 4 }),
        entry({ placeFrom: 3, placeTo: 4 }),
        entry({ placeFrom: 5, placeTo: 8 }),
        entry({ placeFrom: 5, placeTo: 8 }),
        entry({ placeFrom: 5, placeTo: 8 }),
        entry({ placeFrom: 5, placeTo: 8 }),
      ],
    });
    const result = podium(s);
    expect(result.map((e) => e.placeFrom)).toEqual([1, 2, 3, 3]);
  });

  it("returns an empty list when there are no entries within places 1-3", () => {
    const s = section({ entries: [entry({ placeFrom: 5, placeTo: 8 })] });
    expect(podium(s)).toEqual([]);
  });
});

describe("entities/nomination-results hasPlaces", () => {
  it("is false when the section is not finished", () => {
    expect(hasPlaces(section({ finished: false, entries: [entry({})] }))).toBe(false);
  });

  it("is false when finished but entries are empty", () => {
    expect(hasPlaces(section({ finished: true, entries: [] }))).toBe(false);
  });

  it("is true when finished with entries", () => {
    expect(hasPlaces(section({ finished: true, entries: [entry({})] }))).toBe(true);
  });
});

describe("entities/nomination-results emptyNominationResults", () => {
  it("returns an unfinished nomination with no sections", () => {
    expect(emptyNominationResults("n1")).toEqual({
      nominationId: "n1",
      nominationFinished: false,
      sections: [],
    });
  });
});
