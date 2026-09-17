// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBracketLiveSync } from "./use-bracket-live-sync";
import { bracketSeedingKeys } from "./keys";
import type { Bracket } from "@/entities/bracket/lib/types";
import type { BoardBout, Pool } from "@/entities/pool/lib/types";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";

const fighter = (id: string) => ({ fighterId: id, name: id, club: "" });

function container(): Pool {
  return {
    id: "c1",
    nominationId: "n1",
    nominationName: "Длинный меч",
    number: 1,
    name: "1/2 финала",
    members: [],
    status: "POOL_STATUS_ACTIVE",
    arenaId: "",
    arenaName: "",
    standings: [],
  };
}

function bout(overrides: Partial<BoardBout> = {}): BoardBout {
  return {
    id: "b1",
    roundNumber: 1,
    sequenceNumber: 1,
    fighterA: fighter("f1"),
    fighterB: fighter("f2"),
    state: "BOUT_STATE_IN_PROGRESS",
    scoreA: 0,
    scoreB: 0,
    ...overrides,
  };
}

function bracketOf(b: BoardBout | null, stageId = "s1"): Bracket {
  return {
    stage: {
      id: stageId,
      nominationId: "n1",
      position: 1,
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      status: "POOL_LAYOUT_STATUS_READY",
      bracket: { size: 2, thirdPlace: false },
      groups: null,
      rule: null,
      executionStatus: "STAGE_STATUS_ACTIVE",
    },
    rounds: [
      {
        number: 1,
        title: "",
        thirdPlace: false,
        halves: [
          {
            half: 1,
            title: "",
            container: container(),
            pairs: [
              {
                index: 1,
                slotA: { slot: 1, state: "BRACKET_SLOT_STATE_FILLED", fighter: fighter("f1"), sourceLabel: "" },
                slotB: { slot: 2, state: "BRACKET_SLOT_STATE_FILLED", fighter: fighter("f2"), sourceLabel: "" },
                bout: b,
                resolved: true,
              },
            ],
            currentBoutId: "",
          },
        ],
      },
    ],
    unassigned: [],
    canUndo: false,
    champion: null,
    thirdPlaceWinner: null,
  };
}

function snapshotOf(brackets: Bracket[]): NominationLiveSnapshotDto {
  return {
    nominationId: "n1",
    pools: [],
    stages: [],
    brackets,
    results: { nominationId: "n1", nominationFinished: false, sections: [] },
  };
}

describe("useBracketLiveSync (спека 0051, FR-8)", () => {
  let qc: QueryClient;
  const invalidate = vi.fn().mockResolvedValue(undefined);

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Подменяем метод, а не spyOn: дженерик-сигнатура invalidateQueries не
    // сводится к типу спая, и annotation превращается в борьбу с типами.
    qc.invalidateQueries = invalidate as unknown as QueryClient["invalidateQueries"];
    invalidate.mockClear();
  });

  it("не перечитывает сетку на первом же кадре", () => {
    renderHook(({ s }) => useBracketLiveSync("s1", s), {
      wrapper,
      initialProps: { s: snapshotOf([bracketOf(bout())]) },
    });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("перечитывает сетку, когда результат пары изменился (AC-7)", () => {
    const { rerender } = renderHook(({ s }) => useBracketLiveSync("s1", s), {
      wrapper,
      initialProps: { s: snapshotOf([bracketOf(bout())]) },
    });

    rerender({ s: snapshotOf([bracketOf(bout({ state: "BOUT_STATE_FINISHED", scoreA: 5, scoreB: 3 }))]) });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: bracketSeedingKeys.bracket("s1") });
  });

  // Ядро NFR-1: кадр номинации приходит на любое изменение, в том числе на
  // чужой групповой бой. Слепая инвалидация была бы опросом в цикле.
  it("молчит на кадрах, не менявших результаты сетки", () => {
    const { rerender } = renderHook(({ s }) => useBracketLiveSync("s1", s), {
      wrapper,
      initialProps: { s: snapshotOf([bracketOf(bout())]) },
    });

    rerender({ s: snapshotOf([bracketOf(bout())]) });
    rerender({ s: snapshotOf([bracketOf(bout())]) });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("no-op, если у этапа нет сетки в снапшоте (групповой этап)", () => {
    const { rerender } = renderHook(({ s }) => useBracketLiveSync("s1", s), {
      wrapper,
      initialProps: { s: snapshotOf([]) },
    });

    rerender({ s: snapshotOf([bracketOf(bout({ scoreA: 9 }), "s2")]) });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
