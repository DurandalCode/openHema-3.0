// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NominationPublicScreen } from "./nomination-public-screen";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";
import { emptyNominationResults, type NominationResults } from "@/entities/nomination-results/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { Stage } from "@/entities/stage/lib/types";

const useNominationLiveMock = vi.fn((_id: string, initialSnapshot: NominationLiveSnapshotDto) => initialSnapshot);

vi.mock("@/features/nomination-live/api/use-nomination-live", () => ({
  useNominationLive: (id: string, initialSnapshot: NominationLiveSnapshotDto) =>
    useNominationLiveMock(id, initialSnapshot),
}));

const useMyApplicationsMock = vi.fn(() => ({ data: [], isLoading: false }));

vi.mock("@/features/my-applications/api/use-my-applications", () => ({
  useMyApplications: () => useMyApplicationsMock(),
}));

afterEach(() => {
  cleanup();
  useNominationLiveMock.mockClear();
  useMyApplicationsMock.mockClear();
});

const nomination: Nomination = {
  id: "n1",
  tournamentId: "t1",
  title: "Щит-меч, открытая",
  description: "",
  fighterCapacity: null,
  metadata: { rulesUrl: "" },
  position: 0,
  status: "NOMINATION_STATUS_CLOSED",
  createdAt: "",
  updatedAt: "",
};

const groupsStage: Stage = {
  id: "stage-1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_READY",
  bracket: null,
  groups: { groupCount: 1 },
  rule: null,
  executionStatus: "STAGE_STATUS_ACTIVE",
};

function makeSnapshot(overrides: Partial<NominationLiveSnapshotDto> = {}): NominationLiveSnapshotDto {
  return {
    nominationId: "n1",
    pools: [],
    stages: [],
    brackets: [],
    results: emptyNominationResults("n1"),
    ...overrides,
  };
}

const finishedResults: NominationResults = {
  nominationId: "n1",
  nominationFinished: true,
  sections: [
    {
      stageId: "stage-1",
      stageTitle: "Групповой этап",
      stageType: "STAGE_TYPE_GROUPS",
      finished: true,
      entries: [
        { placeFrom: 1, placeTo: 1, fighter: { fighterId: "f1", name: "Гурьев А.", club: "" }, originLabel: "Группа 1" },
      ],
      placesFromOverallOrder: false,
    },
  ],
};

describe("NominationPublicScreen", () => {
  it("подписывается на живой снапшот ровно один раз (NFR-2)", () => {
    render(
      <NominationPublicScreen
        nominationId="n1"
        nomination={nomination}
        initialSnapshot={makeSnapshot()}
        isAuthenticated={false}
      />,
    );
    expect(useNominationLiveMock).toHaveBeenCalledTimes(1);
  });

  it("порядок блоков: шапка → итоги → схема → секции этапов", () => {
    const snapshot = makeSnapshot({
      stages: [groupsStage],
      pools: [
        {
          pool: {
            id: "pool-1",
            nominationId: "n1",
            nominationName: "Щит-меч",
            number: 1,
            name: "Пул A",
            members: [],
            status: "POOL_STATUS_ACTIVE",
            arenaId: "",
            arenaName: "",
            standings: [],
            stageId: "stage-1",
          },
          bouts: [],
          currentBoutId: "",
        },
      ],
      results: finishedResults,
    });
    render(
      <NominationPublicScreen
        nominationId="n1"
        nomination={nomination}
        initialSnapshot={snapshot}
        isAuthenticated={false}
      />,
    );

    const order = [
      screen.getByText("Щит-меч, открытая"),
      screen.getByText("Групповой этап", { selector: "h2, h3" }),
      screen.getByText("Пул A"),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("offers a link from a finished bracket to its visible results section", () => {
    const bracketStage: Stage = {
      ...groupsStage,
      id: "bracket-1",
      title: "Плейофф",
      type: "STAGE_TYPE_BRACKET",
      bracket: { size: 4, thirdPlace: false },
      groups: null,
      executionStatus: "STAGE_STATUS_FINISHED",
    };
    const snapshot = makeSnapshot({
      stages: [bracketStage],
      brackets: [{ stage: bracketStage, rounds: [], unassigned: [], canUndo: false, champion: null, thirdPlaceWinner: null }],
      results: {
        nominationId: "n1",
        nominationFinished: true,
        sections: [{
          stageId: bracketStage.id,
          stageTitle: bracketStage.title,
          stageType: bracketStage.type,
          finished: true,
          placesFromOverallOrder: false,
          entries: [{ placeFrom: 1, placeTo: 1, fighter: { fighterId: "f1", name: "Winner", club: "" }, originLabel: "Финал" }],
        }],
      },
    });

    render(<NominationPublicScreen nominationId="n1" nomination={nomination} initialSnapshot={snapshot} isAuthenticated={false} />);

    expect(screen.getByRole("link", { name: "Итоговые места" })).toHaveAttribute("href", "/nominations/n1#results");
    expect(document.querySelectorAll("#results")).toHaveLength(1);
  });

  it("черновая раскладка (AC-6): пустое состояние, шапка и схема остаются", () => {
    const snapshot = makeSnapshot({ stages: [groupsStage], pools: [], brackets: [] });
    render(
      <NominationPublicScreen
        nominationId="n1"
        nomination={nomination}
        initialSnapshot={snapshot}
        isAuthenticated={false}
      />,
    );
    expect(screen.getByText("Щит-меч, открытая")).toBeInTheDocument();
    expect(screen.getByText(/раскладка ещё формируется/i)).toBeInTheDocument();
    expect(screen.queryByText("Пул A")).not.toBeInTheDocument();
  });

  it("нет этапов вовсе (AC-5): цепочки схемы нет, пустое состояние показано", () => {
    const snapshot = makeSnapshot();
    render(
      <NominationPublicScreen
        nominationId="n1"
        nomination={nomination}
        initialSnapshot={snapshot}
        isAuthenticated={false}
      />,
    );
    expect(screen.queryByTestId("schema-chain")).not.toBeInTheDocument();
    expect(screen.getByText(/раскладка ещё формируется/i)).toBeInTheDocument();
  });

  it("гость (isAuthenticated=false): блок подачи не рендерится (FR-14)", () => {
    render(
      <NominationPublicScreen
        nominationId="n1"
        nomination={nomination}
        initialSnapshot={makeSnapshot()}
        isAuthenticated={false}
      />,
    );
    expect(screen.queryByText("Приём заявок завершён")).not.toBeInTheDocument();
  });

  it("аутентифицированный пользователь: блок подачи рендерится (FR-14, AC-2)", () => {
    render(
      <NominationPublicScreen
        nominationId="n1"
        nomination={nomination}
        initialSnapshot={makeSnapshot()}
        isAuthenticated={true}
      />,
    );
    expect(screen.getByText("Приём заявок завершён")).toBeInTheDocument();
  });
});
