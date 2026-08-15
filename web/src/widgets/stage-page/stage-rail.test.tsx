// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageRail } from "./stage-rail";
import type { NominationLiveSnapshotDto } from "@/entities/nomination-live/lib/types";
import type { FighterRef } from "@/entities/pool/lib/types";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";
import { emptyNominationResults } from "@/entities/nomination-results/lib/types";

const useLiveSnapshotMock = vi.fn();
vi.mock("@/features/nomination-live/api/use-live-snapshot", () => ({
  useLiveSnapshot: (nominationId: string) => useLiveSnapshotMock(nominationId),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fighter(id: string): FighterRef {
  return { fighterId: id, name: `Fighter ${id}`, club: "" };
}

function stage(overrides: Partial<Stage>): Stage {
  return {
    id: "s1",
    nominationId: "n1",
    position: 0,
    title: "Групповой этап",
    type: "STAGE_TYPE_GROUPS",
    status: "POOL_LAYOUT_STATUS_READY",
    bracket: null,
    groups: { groupCount: 3 },
    rule: null,
    executionStatus: "STAGE_STATUS_ACTIVE",
    ...overrides,
  };
}

const groupsStage = stage({
  id: "s1",
  title: "Групповой этап",
  executionStatus: "STAGE_STATUS_FINISHED",
});

const bracketStage = stage({
  id: "s2",
  title: "Плейофф 1/4",
  position: 1,
  type: "STAGE_TYPE_BRACKET",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: { size: 8, thirdPlace: false },
  groups: null,
  executionStatus: "STAGE_STATUS_DRAFT",
});

const semifinalStage = stage({
  id: "s3",
  title: "Полуфинал",
  position: 2,
  type: "STAGE_TYPE_BRACKET",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: { size: 4, thirdPlace: false },
  groups: null,
  executionStatus: "STAGE_STATUS_DRAFT",
});

function snapshotWithGroupProgress(): NominationLiveSnapshotDto {
  return {
    nominationId: "n1",
    stages: [groupsStage],
    brackets: [],
    results: emptyNominationResults("n1"),
    pools: [
      {
        pool: {
          id: "p1",
          nominationId: "n1",
          nominationName: "Длинный меч",
          number: 1,
          name: "Пул 1",
          members: [fighter("f1"), fighter("f2")],
          status: "POOL_STATUS_FINISHED",
          arenaId: "",
          arenaName: "",
          standings: [],
          stageId: "s1",
        },
        bouts: [
          {
            id: "b1",
            roundNumber: 1,
            sequenceNumber: 1,
            fighterA: fighter("f1"),
            fighterB: fighter("f2"),
            state: "BOUT_STATE_FINISHED",
            scoreA: 5,
            scoreB: 3,
          },
        ],
        currentBoutId: "",
      },
    ],
  };
}

function renderRail(overrides: Partial<{
  currentStageId: string;
  stages: Stage[];
  issues: SchemaIssue[];
  snapshot: NominationLiveSnapshotDto | null;
}> = {}) {
  useLiveSnapshotMock.mockReturnValue({ data: overrides.snapshot ?? null });
  render(
    <StageRail
      nominationId="n1"
      currentStageId={overrides.currentStageId ?? "s2"}
      stages={overrides.stages ?? [groupsStage, bracketStage, semifinalStage]}
      issues={overrides.issues ?? []}
    />,
  );
}

describe("StageRail (спека 0032, T9)", () => {
  it("renders stages in the given order (AC-11)", () => {
    renderRail();
    const items = screen.getAllByTestId("stage-rail-item");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Групповой этап")).toBeInTheDocument();
    expect(within(items[1]).getByText("Плейофф 1/4")).toBeInTheDocument();
    expect(within(items[2]).getByText("Полуфинал")).toBeInTheDocument();
  });

  it("marks the current stage with a distinguishable text element (AC-11, NFR-4)", () => {
    renderRail({ currentStageId: "s2" });
    const items = screen.getAllByTestId("stage-rail-item");
    expect(within(items[1]).getByText("текущий")).toBeInTheDocument();
    expect(within(items[0]).queryByText("текущий")).not.toBeInTheDocument();
    expect(within(items[2]).queryByText("текущий")).not.toBeInTheDocument();
  });

  it("each stage is a link to its own stage page (AC-11)", () => {
    renderRail();
    const items = screen.getAllByTestId("stage-rail-item");
    expect(items[0]).toHaveAttribute("href", "/admin/nominations/n1/stages/s1");
    expect(items[2]).toHaveAttribute("href", "/admin/nominations/n1/stages/s3");
  });

  it("shows type, execution status and config summary per stage", () => {
    renderRail();
    const items = screen.getAllByTestId("stage-rail-item");
    expect(within(items[0]).getByText("группы")).toBeInTheDocument();
    expect(within(items[0]).getByText("Завершён")).toBeInTheDocument();
    expect(within(items[0]).getByText("3 гр.")).toBeInTheDocument();
    expect(within(items[1]).getByText("сетка")).toBeInTheDocument();
    expect(within(items[1]).getByText("Черновик")).toBeInTheDocument();
    expect(within(items[1]).getByText("8")).toBeInTheDocument();
  });

  it("shows fighters/bouts progress for a stage present in the live snapshot (AC-12)", () => {
    renderRail({ snapshot: snapshotWithGroupProgress() });
    const items = screen.getAllByTestId("stage-rail-item");
    expect(within(items[0]).getByText("2 бойцов · 1 из 1 боёв")).toBeInTheDocument();
  });

  it("shows no bout counters ('0 из 0') for a draft stage absent from the snapshot (AC-12)", () => {
    renderRail({ snapshot: snapshotWithGroupProgress() });
    const items = screen.getAllByTestId("stage-rail-item");
    // bracketStage (s2) is draft and has no record in the snapshot fixture
    expect(within(items[1]).queryByText(/боёв/)).not.toBeInTheDocument();
    expect(within(items[1]).queryByText(/из 0/)).not.toBeInTheDocument();
  });

  it("shows diagnostics issues and an 'Открыть схему' link (AC-13)", () => {
    const issues: SchemaIssue[] = [
      {
        severity: "SCHEMA_ISSUE_SEVERITY_ERROR",
        code: "SCHEMA_ISSUE_CODE_BAD_SOURCE",
        stageIds: ["s3"],
        message: "У этапа «Финал» не задано правило",
      },
    ];
    renderRail({ issues });
    expect(screen.getByTestId("schema-diagnostics")).toBeInTheDocument();
    expect(screen.getByText(/Ошибки/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Открыть схему →" });
    expect(link).toHaveAttribute("href", "/admin/nominations/n1/stages");
  });

  it("shows 'Схема корректна' when there are no issues (AC-13)", () => {
    renderRail({ issues: [] });
    expect(screen.getByText("Схема корректна")).toBeInTheDocument();
  });
});
