// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NominationSchema } from "./nomination-schema";
import type { Stage } from "@/entities/stage/lib/types";

function stage(overrides: Partial<Stage>): Stage {
  return {
    id: "s1",
    nominationId: "n1",
    position: 0,
    title: "Групповой этап",
    type: "STAGE_TYPE_GROUPS",
    status: "POOL_LAYOUT_STATUS_READY",
    bracket: null,
    groups: { groupCount: 4 },
    rule: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("NominationSchema — linear schema (0018 regression)", () => {
  // AC-18: этап без правила по-прежнему набирается руками и встаёт следующим
  // по порядку — схема с одним этапом на уровень должна выглядеть как плоский
  // список, ничего не сломано.
  it("renders a single group stage without a rule as a flat, one-per-level list", () => {
    const stages = [
      stage({ id: "groups", position: 0, title: "Групповой этап" }),
      stage({
        id: "bracket",
        position: 1,
        title: "Плейофф",
        type: "STAGE_TYPE_BRACKET",
        bracket: { size: 8, thirdPlace: true },
        groups: null,
      }),
    ];
    render(<NominationSchema stages={stages} mode="admin" />);

    const levels = screen.getAllByTestId("schema-level");
    expect(levels).toHaveLength(2);
    expect(within(levels[0]).getAllByTestId("stage-card")).toHaveLength(1);
    expect(within(levels[1]).getAllByTestId("stage-card")).toHaveLength(1);
    expect(screen.getByText("Групповой этап")).toBeInTheDocument();
    expect(screen.getByText("Плейофф")).toBeInTheDocument();
    // без правила — нет подписи "из:"
    expect(screen.queryByText(/^из:/)).not.toBeInTheDocument();
  });
});

describe("NominationSchema — parallel branches (AC-2)", () => {
  it("shows two brackets from the same source on one level, both labeled with the source", () => {
    const stages = [
      stage({ id: "groups", position: 0, title: "Групповой этап" }),
      stage({
        id: "final",
        position: 1,
        title: "Сетка за 1-е место",
        type: "STAGE_TYPE_BRACKET",
        bracket: { size: 8, thirdPlace: true },
        groups: null,
        rule: {
          sourceKind: "STAGE_SOURCE_KIND_STAGE",
          sourceStageId: "groups",
          selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
          placeFrom: 1,
          placeTo: 2,
          method: "STAGE_LAYOUT_METHOD_SEEDED",
        },
      }),
      stage({
        id: "consolation",
        position: 1,
        title: "Утешительная сетка",
        type: "STAGE_TYPE_BRACKET",
        bracket: { size: 4, thirdPlace: false },
        groups: null,
        rule: {
          sourceKind: "STAGE_SOURCE_KIND_STAGE",
          sourceStageId: "groups",
          selector: "STAGE_SELECTOR_KIND_GROUP_PLACES",
          placeFrom: 3,
          placeTo: 0,
          method: "STAGE_LAYOUT_METHOD_SEEDED",
        },
      }),
    ];
    render(<NominationSchema stages={stages} mode="admin" />);

    const levels = screen.getAllByTestId("schema-level");
    expect(levels).toHaveLength(2);
    expect(within(levels[1]).getAllByTestId("stage-card")).toHaveLength(2);
    // обе ветки видно, что питаются от группового этапа
    expect(within(levels[1]).getAllByText("из: Групповой этап")).toHaveLength(2);
    expect(screen.getByText(/Места 1–2 каждой группы/)).toBeInTheDocument();
    expect(screen.getByText(/Места 3 и ниже каждой группы/)).toBeInTheDocument();
  });
});

describe("NominationSchema — asymmetric branches (AC-14-style)", () => {
  it("shows one branch continuing into a bracket while the other ends at groups", () => {
    const stages = [
      stage({ id: "groups", position: 0, title: "Общий круг" }),
      stage({ id: "strong-groups", position: 1, title: "Сильные — группы", groups: { groupCount: 2 } }),
      stage({ id: "weak-groups", position: 1, title: "Слабые — группы", groups: { groupCount: 2 } }),
      stage({
        id: "strong-bracket",
        position: 2,
        title: "Сильные — сетка",
        type: "STAGE_TYPE_BRACKET",
        bracket: { size: 8, thirdPlace: true },
        groups: null,
      }),
    ];
    render(<NominationSchema stages={stages} mode="admin" />);

    const levels = screen.getAllByTestId("schema-level");
    expect(levels).toHaveLength(3);
    expect(within(levels[1]).getAllByTestId("stage-card")).toHaveLength(2);
    expect(within(levels[2]).getAllByTestId("stage-card")).toHaveLength(1);
    expect(screen.getByText("Слабые — группы")).toBeInTheDocument();
    expect(screen.getByText("Сильные — сетка")).toBeInTheDocument();
  });
});

describe("NominationSchema — mode", () => {
  it("renders admin actions slot only in admin mode", () => {
    const stages = [stage({ id: "groups" })];
    render(
      <NominationSchema
        stages={stages}
        mode="admin"
        renderActions={(s) => <button data-testid="admin-action">Сформировать {s.title}</button>}
      />,
    );
    expect(screen.getByTestId("admin-action")).toBeInTheDocument();
  });

  it("does not render admin actions in public mode even when renderActions is passed", () => {
    const stages = [stage({ id: "groups" })];
    render(
      <NominationSchema
        stages={stages}
        mode="public"
        renderActions={(s) => <button data-testid="admin-action">Сформировать {s.title}</button>}
      />,
    );
    expect(screen.queryByTestId("admin-action")).not.toBeInTheDocument();
  });
});
