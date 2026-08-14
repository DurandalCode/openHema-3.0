// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";
import type { NominationSchema } from "../api/use-nomination-schemas";
import { NominationRow } from "./nomination-row";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

function nomination(overrides: Partial<Nomination>): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Длинный меч · муж",
    description: "Основной клинковый разряд",
    fighterCapacity: 32,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function stage(overrides: Partial<Stage>): Stage {
  return {
    id: "s1",
    nominationId: "n1",
    position: 1,
    title: "Групповой этап",
    type: "STAGE_TYPE_GROUPS",
    status: "POOL_LAYOUT_STATUS_DRAFT",
    bracket: null,
    groups: { groupCount: 4 },
    rule: null,
    ...overrides,
  };
}

function baseProps() {
  return {
    orderNumber: 1,
    isFirst: false,
    isLast: false,
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    reorderPending: false,
    schema: undefined as NominationSchema | undefined,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onCloseRegistration: vi.fn(),
    onReopenRegistration: vi.fn(),
    closePending: false,
    reopenPending: false,
  };
}

function openActionsMenu() {
  const trigger = screen.getByRole("button", { name: "Действия" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
  fireEvent.click(trigger);
}

describe("NominationRow", () => {
  it("renders order, nomination, status, schema and capacity columns (AC-1)", () => {
    render(
      <NominationRow
        nomination={nomination({})}
        {...baseProps()}
        schema={{ stages: [stage({ groups: { groupCount: 4 } })], issues: [], isError: false }}
      />,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Длинный меч · муж")).toBeInTheDocument();
    expect(screen.getByText("Основной клинковый разряд")).toBeInTheDocument();
    expect(screen.getByText("Приём открыт")).toBeInTheDocument();
    expect(screen.getByText("Группы (4)")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
  });

  it("shows each registration status as a single short tag (AC-2)", () => {
    const { rerender } = render(
      <NominationRow nomination={nomination({ status: "NOMINATION_STATUS_CLOSED" })} {...baseProps()} />,
    );
    expect(screen.getByText("Приём закрыт")).toBeInTheDocument();

    rerender(<NominationRow nomination={nomination({ status: "NOMINATION_STATUS_ACTIVE" })} {...baseProps()} />);
    expect(screen.getByText("Бои идут")).toBeInTheDocument();

    rerender(<NominationRow nomination={nomination({ status: "NOMINATION_STATUS_FINISHED" })} {...baseProps()} />);
    expect(screen.getByText("Завершена")).toBeInTheDocument();
  });

  it("shows 'Схема не задана' for an unconfigured auto-stage (AC-3)", () => {
    render(
      <NominationRow
        nomination={nomination({})}
        {...baseProps()}
        schema={{ stages: [stage({ groups: { groupCount: 0 } })], issues: [], isError: false }}
      />,
    );

    expect(screen.getByText("Схема не задана")).toBeInTheDocument();
  });

  it("shows the schema summary across levels (AC-3)", () => {
    render(
      <NominationRow
        nomination={nomination({})}
        {...baseProps()}
        schema={{
          stages: [
            stage({ id: "s1", position: 1, type: "STAGE_TYPE_GROUPS", groups: { groupCount: 4 }, bracket: null }),
            stage({ id: "s2", position: 2, type: "STAGE_TYPE_BRACKET", groups: null, bracket: { size: 8, thirdPlace: false } }),
          ],
          issues: [],
          isError: false,
        }}
      />,
    );

    expect(screen.getByText("Группы (4) → Сетка (8)")).toBeInTheDocument();
  });

  it("shows an error-only count marker next to the schema summary (AC-4)", () => {
    const issues: SchemaIssue[] = [
      { severity: "SCHEMA_ISSUE_SEVERITY_ERROR", code: "SCHEMA_ISSUE_CODE_SOURCE_CYCLE", stageIds: ["s1"], message: "x" },
      { severity: "SCHEMA_ISSUE_SEVERITY_ERROR", code: "SCHEMA_ISSUE_CODE_BAD_SOURCE", stageIds: ["s1"], message: "y" },
      { severity: "SCHEMA_ISSUE_SEVERITY_WARNING", code: "SCHEMA_ISSUE_CODE_CAPACITY_UNDERFILL", stageIds: ["s1"], message: "z" },
    ];
    render(
      <NominationRow
        nomination={nomination({})}
        {...baseProps()}
        schema={{ stages: [stage({ groups: { groupCount: 4 } })], issues, isError: false }}
      />,
    );

    expect(screen.getByText("2 ошибки")).toBeInTheDocument();
  });

  it("shows 'схема недоступна' when the stages query failed, without breaking the row (AC-5)", () => {
    render(
      <NominationRow
        nomination={nomination({})}
        {...baseProps()}
        schema={{ stages: [], issues: [], isError: true }}
      />,
    );

    expect(screen.getByText("схема недоступна")).toBeInTheDocument();
    expect(screen.getByText("Длинный меч · муж")).toBeInTheDocument();
  });

  it("lists worded actions including transitions to schema and applications (AC-14)", () => {
    render(<NominationRow nomination={nomination({})} {...baseProps()} />);
    openActionsMenu();

    expect(screen.getByRole("menuitem", { name: "Схема" })).toHaveAttribute(
      "href",
      "/admin/nominations/n1/stages",
    );
    expect(screen.getByRole("menuitem", { name: "Заявки" })).toHaveAttribute(
      "href",
      "/admin/applications?nominationId=n1",
    );
    expect(screen.getByRole("menuitem", { name: "Закрыть приём" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Открыть приём" })).toHaveAttribute(
      "data-disabled",
    );
    expect(screen.getByRole("menuitem", { name: "Править" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Удалить" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
  });

  it("disables 'Открыть приём' with the reason as its own visible text when bouts are in progress (AC-10)", () => {
    render(<NominationRow nomination={nomination({ status: "NOMINATION_STATUS_ACTIVE" })} {...baseProps()} />);
    openActionsMenu();

    const reopenItem = screen.getByRole("menuitem", {
      name: "Бои уже начались — открыть приём нельзя",
    });
    expect(reopenItem).toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: "Закрыть приём" })).toHaveAttribute("data-disabled");
  });

  it("the row itself has no click handler — actions are explicit controls (AC-8/FR-8)", () => {
    render(<NominationRow nomination={nomination({})} {...baseProps()} />);

    const row = screen.getByText("Длинный меч · муж").closest('[data-slot="table-row"]');
    expect(row).not.toHaveClass("cursor-pointer");
  });
});
