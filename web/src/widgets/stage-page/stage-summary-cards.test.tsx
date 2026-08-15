// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StageSummaryCards } from "./stage-summary-cards";
import type { Stage } from "@/entities/stage/lib/types";

afterEach(() => {
  cleanup();
});

const groupsStage: Stage = {
  id: "s1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS",
  status: "POOL_LAYOUT_STATUS_READY",
  bracket: null,
  groups: { groupCount: 4 },
  rule: null,
  executionStatus: "STAGE_STATUS_FINISHED",
};

const ruledStage: Stage = {
  id: "s2",
  nominationId: "n1",
  position: 1,
  title: "Плейофф 1/4",
  type: "STAGE_TYPE_BRACKET",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  bracket: { size: 8, thirdPlace: false },
  groups: null,
  rule: {
    sourceKind: "STAGE_SOURCE_KIND_STAGE",
    sourceStageId: "s1",
    selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
    placeFrom: 1,
    placeTo: 2,
    method: "STAGE_LAYOUT_METHOD_SEEDED",
  },
  executionStatus: "STAGE_STATUS_DRAFT",
};

describe("StageSummaryCards (спека 0032, T10, AC-2)", () => {
  it("shows all three cards for a stage with a rule, filled 8/8", () => {
    render(
      <StageSummaryCards
        stage={ruledStage}
        stages={[groupsStage, ruledStage]}
        nominationId="n1"
        filled={8}
        capacity={8}
      />,
    );

    expect(screen.getByText("Статус этапа")).toBeInTheDocument();
    expect(screen.getByText("Правило отбора")).toBeInTheDocument();
    expect(screen.getByText("Заполнено")).toBeInTheDocument();

    expect(
      screen.getByText("Места 1–2 каждой группы · Групповой этап"),
    ).toBeInTheDocument();

    expect(screen.getByTestId("stage-summary-filled")).toHaveTextContent("8 / 8");
  });

  it("shows the execution status label and explanation", () => {
    render(
      <StageSummaryCards
        stage={groupsStage}
        stages={[groupsStage]}
        nominationId="n1"
        filled={12}
        capacity={18}
      />,
    );
    expect(within(screen.getByTestId("stage-summary-status")).getByText("Завершён")).toBeInTheDocument();
  });

  it("shows 'Правила нет — состав набирается руками' when the stage has no rule (FR-7)", () => {
    render(
      <StageSummaryCards
        stage={groupsStage}
        stages={[groupsStage]}
        nominationId="n1"
        filled={12}
        capacity={18}
      />,
    );
    expect(screen.getByText("Правила нет — набирается руками")).toBeInTheDocument();
  });

  it("the rule card links to the schema screen, not an in-place editor (FR-8, out of scope here)", () => {
    render(
      <StageSummaryCards
        stage={ruledStage}
        stages={[groupsStage, ruledStage]}
        nominationId="n1"
        filled={8}
        capacity={8}
      />,
    );
    const link = within(screen.getByTestId("stage-summary-rule")).getByRole("link");
    expect(link).toHaveAttribute("href", "/admin/nominations/n1/stages");
  });
});
