import { describe, expect, it } from "vitest";
import { tournamentPhase } from "./phase";
import type { LiveNominationDto } from "./types";

function nomination(overrides: Partial<LiveNominationDto>): LiveNominationDto {
  return {
    nominationId: "n1",
    title: "Длинный меч",
    position: 0,
    phase: "upcoming",
    currentStageTitle: "",
    boutTotal: 0,
    boutFinished: 0,
    fighterCount: 0,
    ...overrides,
  };
}

describe("entities/tournament-live/lib/phase tournamentPhase", () => {
  it("returns before when there are no nominations at all", () => {
    expect(tournamentPhase([])).toBe("before");
  });

  it("returns before when every nomination is upcoming (AC-1)", () => {
    expect(
      tournamentPhase([
        nomination({ nominationId: "a", phase: "upcoming" }),
        nomination({ nominationId: "b", phase: "upcoming" }),
      ]),
    ).toBe("before");
  });

  it("returns running when at least one nomination is running (AC-6)", () => {
    expect(
      tournamentPhase([
        nomination({ nominationId: "a", phase: "upcoming" }),
        nomination({ nominationId: "b", phase: "running" }),
      ]),
    ).toBe("running");
  });

  it("returns finished when nominations exist and all are finished (AC-18)", () => {
    expect(
      tournamentPhase([
        nomination({ nominationId: "a", phase: "finished" }),
        nomination({ nominationId: "b", phase: "finished" }),
      ]),
    ).toBe("finished");
  });

  it("treats a mix of upcoming and finished (no running) as running", () => {
    // Пограничный случай без явного правила в спеке: часть номинаций уже
    // доиграна, часть ещё не начата, но ни одна не в процессе. По духу FR-1
    // турнир не «до старта» (хотя бы один бой уже был) и не «завершён»
    // (доиграны не все) — значит «идёт»: смесь трактуется как активный день
    // турнира, а не пограничное «завершён» или «before».
    expect(
      tournamentPhase([
        nomination({ nominationId: "a", phase: "finished" }),
        nomination({ nominationId: "b", phase: "upcoming" }),
      ]),
    ).toBe("running");
  });
});
