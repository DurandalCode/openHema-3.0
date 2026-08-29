// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeScreen } from "./home-screen";
import type { Tournament } from "@/entities/tournament/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import type {
  TournamentLiveSnapshotDto,
  LiveNominationDto,
  LiveArenaDto,
} from "@/entities/tournament-live/lib/types";
import { emptyTournamentLiveSnapshot } from "@/entities/tournament-live/lib/types";

/** FakeEventSource — минимальный контролируемый мок native EventSource
 * (по образцу use-nomination-live.test.ts) — нужен только чтобы
 * useTournamentLive не падал на реальном сетевом коде в фазе running. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    FakeEventSource.instances.push(this);
  }
}

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    title: "Кубок Севера",
    description: "",
    eventStartAt: "2026-08-21T09:00:00Z",
    eventEndAt: "",
    emblemUrl: "",
    isActive: true,
    contacts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    chiefJudge: "",
    regulationsUrl: "",
    venueName: "",
    venueAddress: "",
    entryFeeMinor: null,
    entryFeeCurrency: "",
    program: [],
    regulationsFile: { url: "", name: "", size: 0 },
    emblemFile: { url: "", name: "", size: 0 },
    notifications: { applicationState: false, poolSeated: false },
    ...overrides,
  };
}

function nomination(overrides: Partial<Nomination> = {}): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Длинный меч",
    description: "",
    fighterCapacity: null,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function liveNomination(overrides: Partial<LiveNominationDto> = {}): LiveNominationDto {
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

function snapshot(overrides: Partial<TournamentLiveSnapshotDto> = {}): TournamentLiveSnapshotDto {
  return { ...emptyTournamentLiveSnapshot("t1"), ...overrides };
}

function arena(overrides: Partial<LiveArenaDto> = {}): LiveArenaDto {
  return {
    arenaId: "a1",
    arenaName: "Площадка 1",
    position: 0,
    state: "free",
    nominationId: "",
    nominationName: "",
    poolName: "",
    stageTitle: "",
    currentBout: null,
    poolBoutTotal: 0,
    poolBoutFinished: 0,
    ...overrides,
  };
}

describe("widgets/home HomeScreen (spec 0034)", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ snapshot: null }) })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("AC-19: no active tournament shows the placeholder, no live blocks", () => {
    render(
      <HomeScreen
        tournament={null}
        nominations={[]}
        participantsByNomination={{}}
        rosterByNomination={{}}
        isAuthenticated={false}
        initialLiveSnapshot={emptyTournamentLiveSnapshot("")}
      />,
    );

    expect(screen.getByText("Турнир скоро появится")).toBeInTheDocument();
    expect(screen.queryByText("Площадки прямо сейчас")).not.toBeInTheDocument();
    expect(screen.queryByText("Лента боёв")).not.toBeInTheDocument();
    // before-phase: подписка не нужна, EventSource не создаётся (NFR-1/AC-20).
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("AC-1: before phase renders hero + nominations, not arenas/feed", () => {
    render(
      <HomeScreen
        tournament={tournament()}
        nominations={[nomination()]}
        participantsByNomination={{
          n1: { participants: [], appliedCount: 3, confirmedCount: 1, fighterCapacity: 10 },
        }}
        rosterByNomination={{}}
        isAuthenticated={false}
        initialLiveSnapshot={snapshot({ nominations: [liveNomination({ phase: "upcoming" })] })}
      />,
    );

    expect(screen.getByText("Кубок Севера")).toBeInTheDocument();
    expect(screen.getByText("Длинный меч")).toBeInTheDocument();
    expect(screen.queryByText("Площадки прямо сейчас")).not.toBeInTheDocument();
    expect(screen.queryByText("Лента боёв")).not.toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("AC-3 (spec 0039): before phase passes the arenas count from the snapshot to the hero", () => {
    render(
      <HomeScreen
        tournament={tournament()}
        nominations={[nomination()]}
        participantsByNomination={{}}
        rosterByNomination={{}}
        isAuthenticated={false}
        initialLiveSnapshot={snapshot({
          nominations: [liveNomination({ phase: "upcoming" })],
          arenas: [arena({ arenaId: "a1" }), arena({ arenaId: "a2" }), arena({ arenaId: "a3" })],
        })}
      />,
    );

    expect(screen.getByText(/Площадок:\s*3/)).toBeInTheDocument();
  });

  it("AC-6: running phase renders the strip + feed, not the join-steps/applications-summary", () => {
    render(
      <HomeScreen
        tournament={tournament()}
        nominations={[nomination({ status: "NOMINATION_STATUS_CLOSED" })]}
        participantsByNomination={{}}
        rosterByNomination={{}}
        isAuthenticated={false}
        initialLiveSnapshot={snapshot({ nominations: [liveNomination({ phase: "running" })] })}
      />,
    );

    expect(screen.getByText("Лента боёв")).toBeInTheDocument();
    expect(screen.queryByText("Как участвовать")).not.toBeInTheDocument();
    // running-phase: единственная подписка на странице открыта.
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("AC-18: finished phase hides arenas-now but keeps the feed/rail", () => {
    render(
      <HomeScreen
        tournament={tournament()}
        nominations={[nomination({ status: "NOMINATION_STATUS_CLOSED" })]}
        participantsByNomination={{}}
        rosterByNomination={{}}
        isAuthenticated={false}
        initialLiveSnapshot={snapshot({ nominations: [liveNomination({ phase: "finished" })] })}
      />,
    );

    expect(screen.queryByText("Площадки прямо сейчас")).not.toBeInTheDocument();
    // finished-phase: живой канал не нужен (FR-23), уже отдан статичный снапшот.
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("FR-21: shows registration-closed block when no nomination has open registration", () => {
    render(
      <HomeScreen
        tournament={tournament()}
        nominations={[nomination({ status: "NOMINATION_STATUS_CLOSED" })]}
        participantsByNomination={{}}
        rosterByNomination={{}}
        isAuthenticated={true}
        initialLiveSnapshot={snapshot({ nominations: [liveNomination({ phase: "running" })] })}
      />,
    );

    expect(screen.getByText("Приём заявок завершён")).toBeInTheDocument();
  });
});
