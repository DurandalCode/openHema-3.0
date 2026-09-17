// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StagePageScreen } from "./stage-page-screen";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { Stage } from "@/entities/stage/lib/types";
import type { PoolLayout } from "@/entities/pool/lib/types";
import type { LivePoolDto, NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";

/**
 * Отдельный файл от `stage-page-screen.test.tsx` намеренно: там
 * `useNominationLive` замокан, а здесь он должен быть НАСТОЯЩИМ — иначе
 * подписку не посчитать. Соседние хуки и тяжёлые дети (dnd-kit внутри
 * `NominationPools`) по-прежнему застабаны; стабы показывают, что до них
 * доехало, чтобы проверить не только число каналов, но и раздачу снапшота.
 *
 * Спека 0051, NFR-1: живой снапшот номинации на экране этапа — один на всех.
 * Раньше рельс тянул его сам, и это сходило с рук только потому, что
 * `useQuery` делится кэшем по общему ключу; SSE так не делится.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  /** Кадр канала — сам снапшот, без обёртки (см. `use-nomination-live.ts`). */
  emit(snapshot: NominationLiveSnapshotDto) {
    this.onmessage?.({ data: JSON.stringify(snapshot) } as MessageEvent<string>);
  }
}

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
  status: "POOL_LAYOUT_STATUS_READY",
  bracket: null,
  groups: { groupCount: 1 },
  rule: null,
  executionStatus: "STAGE_STATUS_ACTIVE",
};

const layout: PoolLayout = {
  nominationId: "n1",
  status: "POOL_LAYOUT_STATUS_READY",
  unassigned: [],
  pools: [],
  canUndo: false,
  stage: groupStage,
};

const useStagesMock = vi.fn();
const useLayoutMock = vi.fn();

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
  useBracket: () => ({ data: null, isLoading: false, error: null }),
}));
vi.mock("@/features/nomination-pools/api/use-set-layout-status", () => ({
  useSetLayoutStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/features/bracket-seeding/api/use-set-bracket-status", () => ({
  useSetBracketStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

// Стабы, показывающие ПОЛУЧЕННОЕ: так один тест проверяет и число каналов,
// и что снапшот из единственной подписки дошёл до обоих потребителей.
vi.mock("@/features/nomination-pools/ui/nomination-pools", () => ({
  NominationPools: ({ livePools }: { livePools: LivePoolDto[] }) => (
    <div data-testid="pools-stub">
      бои:{livePools.reduce((n, lp) => n + lp.bouts.length, 0)}
    </div>
  ),
}));
vi.mock("./stage-rail", () => ({
  StageRail: ({ snapshot }: { snapshot: NominationLiveSnapshotDto | null }) => (
    <div data-testid="rail-stub">пулов:{snapshot?.pools.length ?? 0}</div>
  ),
}));
vi.mock("./stage-actions", () => ({ StageActions: () => <div /> }));
vi.mock("./stage-summary-cards", () => ({ StageSummaryCards: () => <div /> }));

function snapshotWithBout(): NominationLiveSnapshotDto {
  const f = (id: string, name: string) => ({ fighterId: id, name, club: "" });
  return {
    nominationId: "n1",
    pools: [
      {
        pool: {
          id: "pool-1",
          nominationId: "n1",
          nominationName: "Длинный меч",
          number: 1,
          name: "Пул 1",
          members: [],
          status: "POOL_STATUS_ACTIVE",
          arenaId: "",
          arenaName: "",
          standings: [],
        },
        bouts: [
          {
            id: "b1",
            roundNumber: 1,
            sequenceNumber: 1,
            fighterA: f("f1", "Иванов"),
            fighterB: f("f2", "Петров"),
            state: "BOUT_STATE_FINISHED",
            scoreA: 5,
            scoreB: 3,
          },
        ],
        currentBoutId: "",
      },
    ],
    stages: [],
    brackets: [],
    results: { nominationId: "n1", nominationFinished: false, sections: [] },
  };
}

describe("StagePageScreen — живой снапшот (спека 0051)", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    useStagesMock.mockReturnValue({
      data: { stages: [groupStage], issues: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    useLayoutMock.mockReturnValue({ data: layout, isLoading: false, error: null, refetch: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("открывает ровно один живой канал на экран (NFR-1)", () => {
    render(<StagePageScreen nomination={nomination} stageId="s1" initialStages={[groupStage]} />);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/api/nominations/n1/live");
  });

  it("раздаёт кадр из этой единственной подписки и группам, и рельсу (AC-7)", () => {
    render(<StagePageScreen nomination={nomination} stageId="s1" initialStages={[groupStage]} />);

    expect(screen.getByTestId("pools-stub")).toHaveTextContent("бои:0");
    expect(screen.getByTestId("rail-stub")).toHaveTextContent("пулов:0");

    act(() => {
      FakeEventSource.instances[0].emit(snapshotWithBout());
    });

    expect(screen.getByTestId("pools-stub")).toHaveTextContent("бои:1");
    expect(screen.getByTestId("rail-stub")).toHaveTextContent("пулов:1");
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
