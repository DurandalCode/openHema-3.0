// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NominationSchema } from "./nomination-schema";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";

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
    executionStatus: "STAGE_STATUS_UNSPECIFIED",
    ...overrides,
  };
}

function issue(overrides: Partial<SchemaIssue>): SchemaIssue {
  return {
    severity: "SCHEMA_ISSUE_SEVERITY_ERROR",
    code: "SCHEMA_ISSUE_CODE_SELECTOR_OVERLAP",
    stageIds: [],
    message: "Ветки пересекаются по месту 2",
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

describe("NominationSchema — schema diagnostics (0020, FR-8)", () => {
  it("renders an issue badge on the stage card it's attached to, and not on other cards", () => {
    const stages = [stage({ id: "stage-a", title: "Этап А" }), stage({ id: "stage-b", title: "Этап Б" })];
    const issues = [issue({ stageIds: ["stage-a"], message: "Отбор превышает вместимость сетки" })];
    render(<NominationSchema stages={stages} mode="admin" issues={issues} />);

    const cards = screen.getAllByTestId("stage-card");
    const cardA = cards.find((c) => within(c).queryByText("Этап А"))!;
    const cardB = cards.find((c) => within(c).queryByText("Этап Б"))!;
    expect(within(cardA).getByText("Отбор превышает вместимость сетки")).toBeInTheDocument();
    expect(within(cardB).queryByText("Отбор превышает вместимость сетки")).not.toBeInTheDocument();
    expect(within(cardB).queryByTestId("stage-issues")).not.toBeInTheDocument();
  });

  it("distinguishes error/warning/info with three different testids", () => {
    const stages = [stage({ id: "stage-a" })];
    const issues = [
      issue({ severity: "SCHEMA_ISSUE_SEVERITY_ERROR", code: "SCHEMA_ISSUE_CODE_CAPACITY_EXCEEDED", stageIds: ["stage-a"], message: "Отобранных больше, чем слотов" }),
      issue({ severity: "SCHEMA_ISSUE_SEVERITY_WARNING", code: "SCHEMA_ISSUE_CODE_CAPACITY_UNDERFILL", stageIds: ["stage-a"], message: "Отбор заведомо меньше размера сетки" }),
      issue({ severity: "SCHEMA_ISSUE_SEVERITY_INFO", code: "SCHEMA_ISSUE_CODE_TAIL_UNCOVERED", stageIds: ["stage-a"], message: "Хвост состава никуда не проходит" }),
    ];
    render(<NominationSchema stages={stages} mode="admin" issues={issues} />);

    expect(screen.getByTestId("schema-issue-error")).toHaveTextContent("Отобранных больше, чем слотов");
    expect(screen.getByTestId("schema-issue-warning")).toHaveTextContent("Отбор заведомо меньше размера сетки");
    expect(screen.getByTestId("schema-issue-info")).toHaveTextContent("Хвост состава никуда не проходит");
    // три разных data-variant у Badge — визуально различимые маркеры
    const variants = new Set(
      ["schema-issue-error", "schema-issue-warning", "schema-issue-info"].map(
        (testId) => screen.getByTestId(testId).getAttribute("data-variant"),
      ),
    );
    expect(variants.size).toBe(3);
  });

  it("renders a summary block above the schema when issues is non-empty", () => {
    const stages = [stage({ id: "stage-a" })];
    const issues = [issue({ stageIds: ["stage-a"] })];
    render(<NominationSchema stages={stages} mode="admin" issues={issues} />);
    expect(screen.getByTestId("schema-issues-summary")).toBeInTheDocument();
  });

  it("does not render a summary block when issues is not passed", () => {
    const stages = [stage({ id: "stage-a" })];
    render(<NominationSchema stages={stages} mode="admin" />);
    expect(screen.queryByTestId("schema-issues-summary")).not.toBeInTheDocument();
  });

  it("does not render a summary block when issues is an empty array", () => {
    const stages = [stage({ id: "stage-a" })];
    render(<NominationSchema stages={stages} mode="admin" issues={[]} />);
    expect(screen.queryByTestId("schema-issues-summary")).not.toBeInTheDocument();
  });

  it("renders no issues at all in public mode, even when issues is passed", () => {
    const stages = [stage({ id: "stage-a" })];
    const issues = [issue({ stageIds: ["stage-a"], message: "Отбор превышает вместимость сетки" })];
    render(<NominationSchema stages={stages} mode="public" issues={issues} />);

    expect(screen.queryByTestId("schema-issues-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stage-issues")).not.toBeInTheDocument();
    expect(screen.queryByText("Отбор превышает вместимость сетки")).not.toBeInTheDocument();
  });
});
