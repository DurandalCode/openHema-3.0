// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StagePageScreen } from "./stage-page-screen";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { Stage } from "@/entities/stage/lib/types";
import type { PoolLayout } from "@/entities/pool/lib/types";
import type { Bracket } from "@/entities/bracket/lib/types";
import { emptyNominationLiveSnapshot } from "@/entities/nomination-live/lib/types";

function afterEachCleanup() {
  cleanup();
}
afterEach(afterEachCleanup);

const nomination: Nomination = {
  id: "n1",
  tournamentId: "t1",
  title: "Длинный меч",
  description: "",
  fighterCapacity: 32,
  metadata: { rulesUrl: "" },
  position: 0,
  status: "NOMINATION_STATUS_OPEN",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const groupStage: Stage = {
  id: "s1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: null,
  groups: { groupCount: 4 },
  rule: null,
  executionStatus: "STAGE_STATUS_DRAFT",
};

const bracketStage: Stage = {
  ...groupStage,
  id: "s2",
  position: 1,
  title: "Плейофф",
  type: "STAGE_TYPE_BRACKET",
  bracket: { size: 8, thirdPlace: false },
  groups: null,
};

const useStagesMock = vi.fn();
const useLayoutMock = vi.fn();
const useBracketMock = vi.fn();
const setLayoutStatusMutate = vi.fn();
const setBracketStatusMutate = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/features/stage-management/api/use-stages", () => ({
  useStages: (...args: unknown[]) => useStagesMock(...args),
}));
vi.mock("@/features/nomination-pools/api/use-layout", () => ({
  useLayout: (...args: unknown[]) => useLayoutMock(...args),
}));
vi.mock("@/features/bracket-seeding/api/use-bracket-live-sync", () => ({
  useBracketLiveSync: () => {},
}));
vi.mock("@/features/bracket-seeding/api/use-bracket", () => ({
  useBracket: (...args: unknown[]) => useBracketMock(...args),
}));
vi.mock("@/features/nomination-pools/api/use-set-layout-status", () => ({
  useSetLayoutStatus: () => ({ mutate: setLayoutStatusMutate, isPending: false }),
}));
vi.mock("@/features/bracket-seeding/api/use-set-bracket-status", () => ({
  useSetBracketStatus: () => ({ mutate: setBracketStatusMutate, isPending: false }),
}));
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (message: string) => toastSuccessMock(message),
  toastError: (message: string, options?: { retry?: () => void }) => toastErrorMock(message, options),
}));
// Спека 0051: экран — единственный владелец живого снапшота номинации.
const useNominationLiveMock = vi.fn((nominationId: string) =>
  emptyNominationLiveSnapshot(nominationId),
);
vi.mock("@/features/nomination-live/api/use-nomination-live", () => ({
  useNominationLive: (nominationId: string) => useNominationLiveMock(nominationId),
}));

vi.mock("@/features/nomination-pools/ui/nomination-pools", () => ({
  NominationPools: ({ stageId }: { stageId: string }) => (
    <div data-testid="nomination-pools-stub">NominationPools:{stageId}</div>
  ),
}));
vi.mock("@/features/bracket-seeding/ui/bracket-seeding", () => ({
  BracketSeeding: ({ stageId }: { stageId: string }) => (
    <div data-testid="bracket-seeding-stub">BracketSeeding:{stageId}</div>
  ),
}));
vi.mock("./stage-actions", () => ({
  StageActions: ({ stage }: { stage: Stage }) => <div data-testid="stage-actions-stub">{stage.id}</div>,
}));
vi.mock("./stage-summary-cards", () => ({
  StageSummaryCards: ({ stage }: { stage: Stage }) => (
    <div data-testid="stage-summary-cards-stub">{stage.id}</div>
  ),
}));
vi.mock("./stage-rail", () => ({
  StageRail: ({ currentStageId }: { currentStageId: string }) => (
    <div data-testid="stage-rail-stub">{currentStageId}</div>
  ),
}));
vi.mock("./stage-page-skeleton", () => ({
  StagePageSkeleton: () => <div data-testid="stage-page-skeleton-stub" />,
}));

function emptyLayout(overrides: Partial<PoolLayout> = {}): PoolLayout {
  return {
    nominationId: "n1",
    status: "POOL_LAYOUT_STATUS_DRAFT",
    unassigned: [],
    pools: [],
    canUndo: false,
    stage: groupStage,
    ...overrides,
  };
}

function emptyBracket(overrides: Partial<Bracket> = {}): Bracket {
  return {
    stage: bracketStage,
    rounds: [],
    unassigned: [],
    canUndo: false,
    champion: null,
    thirdPlaceWinner: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useLayoutMock.mockReturnValue({ data: emptyLayout(), isLoading: false });
  useBracketMock.mockReturnValue({ data: emptyBracket(), isLoading: false });
  useNominationLiveMock.mockImplementation((nominationId: string) => emptyNominationLiveSnapshot(nominationId));
});

describe("StagePageScreen", () => {
  // Спека 0032, AC-1: шапка несёт крошку/название/статус/сводку/фиксацию и
  // ссылку «← Схема номинации»; строки «← Все этапы» на странице нет.
  it("renders PageHeader with breadcrumb, status, meta, and a link back to the schema (AC-1)", () => {
    useStagesMock.mockReturnValue({ data: { stages: [groupStage, bracketStage], issues: [] }, isLoading: false, error: null, refetch: vi.fn() });

    render(<StagePageScreen nomination={nomination} stageId="s1" initialStages={[groupStage, bracketStage]} />);

    expect(screen.getByText("Групповой этап")).toBeInTheDocument();
    expect(screen.getByText("Черновик")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Схема номинации" })).toHaveAttribute(
      "href",
      "/admin/nominations/n1/stages",
    );
    expect(screen.queryByText("← Все этапы")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "← Все этапы" })).not.toBeInTheDocument();
  });

  // Спека 0032, AC-3: тело — по типу этапа.
  it("renders NominationPools for a group stage", () => {
    useStagesMock.mockReturnValue({ data: { stages: [groupStage], issues: [] }, isLoading: false, error: null, refetch: vi.fn() });

    render(<StagePageScreen nomination={nomination} stageId="s1" initialStages={[groupStage]} />);

    expect(screen.getByTestId("nomination-pools-stub")).toHaveTextContent("s1");
    expect(screen.queryByTestId("bracket-seeding-stub")).not.toBeInTheDocument();
  });

  it("renders BracketSeeding for a bracket stage", () => {
    useStagesMock.mockReturnValue({ data: { stages: [groupStage, bracketStage], issues: [] }, isLoading: false, error: null, refetch: vi.fn() });

    render(<StagePageScreen nomination={nomination} stageId="s2" initialStages={[groupStage, bracketStage]} />);

    expect(screen.getByTestId("bracket-seeding-stub")).toHaveTextContent("s2");
    expect(screen.queryByTestId("nomination-pools-stub")).not.toBeInTheDocument();
  });

  it("links a finished terminal bracket to its existing results", () => {
    const finishedBracket = { ...bracketStage, executionStatus: "STAGE_STATUS_FINISHED" as const };
    useStagesMock.mockReturnValue({ data: { stages: [groupStage, finishedBracket], issues: [] }, isLoading: false, error: null, refetch: vi.fn() });
    useNominationLiveMock.mockImplementation((nominationId: string) => ({
      ...emptyNominationLiveSnapshot(nominationId),
      results: {
        nominationId,
        nominationFinished: true,
        sections: [{
          stageId: finishedBracket.id,
          stageTitle: finishedBracket.title,
          stageType: finishedBracket.type,
          finished: true,
          placesFromOverallOrder: false,
          entries: [{ placeFrom: 1, placeTo: 1, fighter: { fighterId: "f1", name: "Winner", club: "" }, originLabel: "Финал" }],
        }],
      },
    }));

    render(<StagePageScreen nomination={nomination} stageId="s2" initialStages={[groupStage, finishedBracket]} />);

    expect(screen.getByRole("link", { name: "Итоговые места" })).toHaveAttribute("href", "/nominations/n1#results");
  });

  it("does not link a finished non-terminal bracket to absent results", () => {
    const finishedBracket = { ...bracketStage, executionStatus: "STAGE_STATUS_FINISHED" as const };
    useStagesMock.mockReturnValue({ data: { stages: [groupStage, finishedBracket], issues: [] }, isLoading: false, error: null, refetch: vi.fn() });
    render(<StagePageScreen nomination={nomination} stageId="s2" initialStages={[groupStage, finishedBracket]} />);
    expect(screen.queryByRole("link", { name: "Итоговые места" })).not.toBeInTheDocument();
  });

  // Спека 0032, AC-15: скелетон в форме каркаса при загрузке.
  it("shows the frame-shaped skeleton while stages are loading (AC-15)", () => {
    useStagesMock.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });

    render(<StagePageScreen nomination={nomination} stageId="s1" initialStages={[]} />);

    expect(screen.getByTestId("stage-page-skeleton-stub")).toBeInTheDocument();
  });

  it("shows a retryable error message when stages fail to load (AC-15)", () => {
    const refetch = vi.fn();
    useStagesMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom"), refetch });

    render(<StagePageScreen nomination={nomination} stageId="s1" initialStages={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // Спека 0032, FR-2/FR-3: фиксация в шапке зовёт правильную мутацию по типу.
  it("toggles fixation for a group stage via useSetLayoutStatus", () => {
    setLayoutStatusMutate.mockImplementation((_status, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    useStagesMock.mockReturnValue({ data: { stages: [groupStage], issues: [] }, isLoading: false, error: null, refetch: vi.fn() });

    render(<StagePageScreen nomination={nomination} stageId="s1" initialStages={[groupStage]} />);
    fireEvent.click(screen.getByRole("button", { name: "Зафиксировать" }));

    expect(setLayoutStatusMutate).toHaveBeenCalledWith("ready", expect.anything());
    expect(setBracketStatusMutate).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("toggles fixation for a bracket stage via useSetBracketStatus", () => {
    setBracketStatusMutate.mockImplementation((_status, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    useStagesMock.mockReturnValue({ data: { stages: [groupStage, bracketStage], issues: [] }, isLoading: false, error: null, refetch: vi.fn() });

    render(<StagePageScreen nomination={nomination} stageId="s2" initialStages={[groupStage, bracketStage]} />);
    fireEvent.click(screen.getByRole("button", { name: "Зафиксировать" }));

    expect(setBracketStatusMutate).toHaveBeenCalledWith("ready", expect.anything());
    expect(setLayoutStatusMutate).not.toHaveBeenCalled();
  });

  it("renders the summary cards, actions, and rail widgets", () => {
    useStagesMock.mockReturnValue({ data: { stages: [groupStage, bracketStage], issues: [] }, isLoading: false, error: null, refetch: vi.fn() });

    render(<StagePageScreen nomination={nomination} stageId="s1" initialStages={[groupStage, bracketStage]} />);

    expect(screen.getByTestId("stage-summary-cards-stub")).toBeInTheDocument();
    expect(screen.getByTestId("stage-actions-stub")).toBeInTheDocument();
    expect(screen.getByTestId("stage-rail-stub")).toHaveTextContent("s1");
  });

  // Название этапа на экране ровно одно — в PageHeader (спека 0032).
  // Маленькая серая подпись из 0017 дублировала его и сдвигала левую
  // колонку вниз относительно рельса; убрана спекой 0051.
  it("показывает название этапа один раз, в шапке раздела", () => {
    useStagesMock.mockReturnValue({
      data: { stages: [groupStage], issues: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<StagePageScreen nomination={nomination} stageId="s1" initialStages={[groupStage]} />);

    expect(screen.getAllByText("Групповой этап")).toHaveLength(1);
  });
});
