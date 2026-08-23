// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardScreen } from "./dashboard-screen";
import type { CurrentUser } from "@/entities/user/lib/types";
import type { Fighter } from "@/entities/fighter/lib/types";
import type { LiveFeedBoutDto, LiveNominationDto, TournamentLiveSnapshotDto } from "@/entities/tournament-live/lib/types";
import { emptyTournamentLiveSnapshot } from "@/entities/tournament-live/lib/types";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    FakeEventSource.instances.push(this);
  }
  emitMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

const applicationsQueryResult = {
  data: [] as unknown[],
  isLoading: false,
};
vi.mock("@/features/my-applications/api/use-my-applications", () => ({
  useMyApplications: () => applicationsQueryResult,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderScreen(props: Partial<Parameters<typeof DashboardScreen>[0]> = {}) {
  const user: CurrentUser = {
    id: "u1",
    email: "ivan@example.com",
    displayName: "Иван",
    role: "ROLE_USER",
    createdAt: "2026-01-14T00:00:00.000Z",
    club: "",
  };
  return render(
    <DashboardScreen
      user={user}
      myFighter={null}
      initialSnapshot={emptyTournamentLiveSnapshot("t1")}
      nominationTitleById={{ n1: "Длинный меч" }}
      {...props}
    />,
    { wrapper },
  );
}

function fighter(overrides: Partial<Fighter> = {}): Fighter {
  return {
    id: "f1",
    tournamentId: "t1",
    name: "Иван Кравцов",
    club: "Северный клинок",
    status: "FIGHTER_STATUS_ACTIVE",
    withdrawalReason: "WITHDRAWAL_REASON_UNSPECIFIED",
    participations: [{ nominationId: "n1", status: "PARTICIPATION_STATUS_ACTIVE" }],
    createdAt: "2026-01-14T00:00:00.000Z",
    updatedAt: "2026-01-14T00:00:00.000Z",
    fromApplication: true,
    ...overrides,
  };
}

function bout(overrides: Partial<LiveFeedBoutDto> = {}): LiveFeedBoutDto {
  return {
    boutId: "b1",
    nominationId: "n1",
    nominationName: "Длинный меч",
    stageTitle: "Группа A",
    poolName: "Пул C",
    arenaId: "a1",
    arenaName: "Арена 1",
    sequenceNumber: 3,
    poolBoutTotal: 5,
    fighterA: { fighterId: "f1", name: "Иван Кравцов", club: "Северный клинок" },
    fighterB: { fighterId: "f2", name: "Соперник", club: "Клуб 2" },
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function runningSnapshot(bouts: LiveFeedBoutDto[]): TournamentLiveSnapshotDto {
  const nominations: LiveNominationDto[] = [
    {
      nominationId: "n1",
      title: "Длинный меч",
      position: 0,
      phase: "running",
      currentStageTitle: "Группа A",
      boutTotal: 5,
      boutFinished: 1,
      fighterCount: 8,
    },
  ];
  return {
    tournamentId: "t1",
    arenas: [],
    bouts,
    nominations,
    serverNowUnixMs: "1000",
  };
}

describe("widgets/dashboard/DashboardScreen", () => {
  beforeEach(() => {
    applicationsQueryResult.data = [];
    applicationsQueryResult.isLoading = false;
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("without a fighter: hides nominations/next-bout blocks and does not open a live subscription (FR-37)", () => {
    renderScreen({ myFighter: null, initialSnapshot: runningSnapshot([]) });

    expect(screen.queryByText("Мои номинации")).not.toBeInTheDocument();
    expect(screen.queryByText(/ваш следующий бой/i)).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("without applications: shows an invitation instead of an empty list (FR-29)", () => {
    renderScreen();

    expect(screen.getByText("Заявок пока нет")).toBeInTheDocument();
  });

  it("with a fighter and a running tournament: shows nominations, queue position, and opens a live subscription", () => {
    const b = bout({ sequenceNumber: 5 });
    const before1 = bout({
      boutId: "before1",
      sequenceNumber: 3,
      fighterA: { fighterId: "x", name: "X", club: "" },
      fighterB: { fighterId: "y", name: "Y", club: "" },
    });
    const before2 = bout({
      boutId: "before2",
      sequenceNumber: 4,
      fighterA: { fighterId: "x", name: "X", club: "" },
      fighterB: { fighterId: "y", name: "Y", club: "" },
    });

    renderScreen({
      myFighter: fighter(),
      initialSnapshot: runningSnapshot([before1, before2, b]),
    });

    expect(screen.getByText("Мои номинации")).toBeInTheDocument();
    expect(screen.getByText(/вы — соперник/i)).toBeInTheDocument();
    expect(screen.getByText(/через 2 боя/i)).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("does not open a live subscription when the tournament is not running, even with a fighter (NFR-3)", () => {
    renderScreen({
      myFighter: fighter(),
      initialSnapshot: emptyTournamentLiveSnapshot("t1"),
    });

    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("a withdrawn fighter: shows a withdrawal notice and hides the next-bout card (FR-36)", () => {
    renderScreen({
      myFighter: fighter({ status: "FIGHTER_STATUS_WITHDRAWN", withdrawalReason: "WITHDRAWAL_REASON_INJURY" }),
      initialSnapshot: runningSnapshot([bout()]),
    });

    expect(screen.getByText(/выбыл/i)).toBeInTheDocument();
    expect(screen.queryByText(/ваш следующий бой/i)).not.toBeInTheDocument();
  });

  it("live score update: an incoming SSE frame updates the in-progress bout's score without reload", async () => {
    const inProgress = bout({ state: "BOUT_STATE_IN_PROGRESS", scoreA: 3, scoreB: 1 });

    renderScreen({
      myFighter: fighter(),
      initialSnapshot: runningSnapshot([inProgress]),
    });

    expect(screen.getByText("3:1")).toBeInTheDocument();

    await act(async () => {
      FakeEventSource.instances[0].emitMessage(
        runningSnapshot([{ ...inProgress, scoreA: 8, scoreB: 4 }]),
      );
    });

    expect(screen.getByText("8:4")).toBeInTheDocument();
  });
});
