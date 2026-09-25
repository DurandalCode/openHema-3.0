// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StageSection } from "./stage-section";
import type { Stage } from "@/entities/stage/lib/types";
import type { LivePoolDto } from "@/entities/nomination-live/lib/types";
import type { Bracket } from "@/entities/bracket/lib/types";

afterEach(() => cleanup());

function makeStage(overrides: Partial<Stage> = {}): Stage {
  return {
    id: "stage-1",
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

function makeLivePool(id: string): LivePoolDto {
  return {
    pool: {
      id,
      nominationId: "n1",
      nominationName: "Щит-меч",
      number: 1,
      name: "Пул A",
      members: [{ fighterId: "f1", name: "Гурьев А.", club: "Ратник" }],
      status: "POOL_STATUS_ACTIVE",
      arenaId: "arena-1",
      arenaName: "Арена 3",
      standings: [],
      stageId: "stage-1",
    },
    bouts: [],
    currentBoutId: "",
  };
}

const emptyBracket: Bracket = {
  stage: makeStage({ id: "stage-2", type: "STAGE_TYPE_BRACKET", title: "Плейофф на 8", bracket: { size: 8, thirdPlace: false }, groups: null }),
  rounds: [],
  unassigned: [],
  canUndo: false,
  champion: null,
  thirdPlaceWinner: null,
};

describe("StageSection", () => {
  it("групповой этап с пулами: заголовок этапа + карточки групп (FR-15)", () => {
    const stage = makeStage();
    render(<StageSection stage={stage} stages={[stage]} pools={[makeLivePool("pool-1")]} bracket={null} />);
    expect(screen.getByText("Групповой этап")).toBeInTheDocument();
    expect(screen.getByText("Пул A")).toBeInTheDocument();
  });

  it("групповой этап без пулов: блок-обещание вместо карточек (AC-4)", () => {
    const stage = makeStage({ executionStatus: "STAGE_STATUS_DRAFT" });
    render(<StageSection stage={stage} stages={[stage]} pools={[]} bracket={null} />);
    expect(screen.queryByText("Пул A")).not.toBeInTheDocument();
    expect(screen.getByText(/сформируется по результатам/i)).toBeInTheDocument();
  });

  it("этап-сетка с брекетом: рендерит BracketView под заголовком этапа", () => {
    const stage = emptyBracket.stage;
    render(<StageSection stage={stage} stages={[stage]} pools={[]} bracket={emptyBracket} />);
    expect(screen.getByText("Плейофф на 8")).toBeInTheDocument();
  });

  it("links a finished terminal bracket to the nomination results", () => {
    const stage = makeStage({ ...emptyBracket.stage, executionStatus: "STAGE_STATUS_FINISHED" });
    render(<StageSection stage={stage} stages={[stage]} pools={[]} bracket={emptyBracket} hasResults />);
    expect(screen.getByRole("link", { name: "Итоговые места" })).toHaveAttribute("href", "/nominations/n1#results");
  });

  it("does not link an unfinished bracket or a finished non-terminal bracket without results", () => {
    const unfinished = emptyBracket.stage;
    const { rerender } = render(<StageSection stage={unfinished} stages={[unfinished]} pools={[]} bracket={emptyBracket} hasResults />);
    expect(screen.queryByRole("link", { name: "Итоговые места" })).not.toBeInTheDocument();

    const finished = makeStage({ ...emptyBracket.stage, executionStatus: "STAGE_STATUS_FINISHED" });
    rerender(<StageSection stage={finished} stages={[finished]} pools={[]} bracket={emptyBracket} hasResults={false} />);
    expect(screen.queryByRole("link", { name: "Итоговые места" })).not.toBeInTheDocument();
  });

  it("этап-сетка без брекета: блок-обещание (AC-4)", () => {
    const stage = makeStage({
      id: "stage-2",
      type: "STAGE_TYPE_BRACKET",
      title: "Плейофф на 8",
      bracket: { size: 8, thirdPlace: false },
      groups: null,
      executionStatus: "STAGE_STATUS_DRAFT",
    });
    render(<StageSection stage={stage} stages={[stage]} pools={[]} bracket={null} />);
    expect(screen.getByText(/сформируется по результатам/i)).toBeInTheDocument();
  });

  it("подпись ожидания источника, когда правило указывает на предыдущий этап", () => {
    const source = makeStage({ id: "stage-1", title: "Групповой этап", executionStatus: "STAGE_STATUS_FINISHED" });
    const stage = makeStage({
      id: "stage-2",
      type: "STAGE_TYPE_BRACKET",
      title: "Плейофф на 8",
      bracket: { size: 8, thirdPlace: false },
      groups: null,
      executionStatus: "STAGE_STATUS_DRAFT",
      rule: {
        sourceKind: "STAGE_SOURCE_KIND_STAGE",
        sourceStageId: "stage-1",
        selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
        placeFrom: 1,
        placeTo: 2,
        method: "STAGE_LAYOUT_METHOD_SEEDED",
      },
    });
    render(<StageSection stage={stage} stages={[source, stage]} pools={[]} bracket={null} />);
    expect(screen.getByText(/групповой этап/i)).toBeInTheDocument();
  });
});
