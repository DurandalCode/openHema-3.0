// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Arena } from "@/entities/arena/lib/types";
import type { ArenaBoardState } from "../api/use-arena-boards";
import { ArenaRow } from "./arena-row";

afterEach(() => {
  cleanup();
});

function arena(overrides: Partial<Arena>): Arena {
  return {
    id: "a1",
    tournamentId: "t1",
    name: "Арена 2",
    description: "малый ковёр · у окна",
    position: 1,
    status: "ARENA_STATUS_ACTIVE",
    defaultDurationSeconds: 180,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseProps() {
  return {
    orderNumber: 1,
    boardState: undefined as ArenaBoardState | undefined,
    isFirst: false,
    isLast: false,
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    reorderPending: false,
    onEdit: vi.fn(),
    onArchive: vi.fn(),
    onRestore: vi.fn(),
    archivePending: false,
    restorePending: false,
  };
}

describe("ArenaRow", () => {
  it("renders the five columns: order, arena, status, duration, actions (AC-1)", () => {
    render(
      <ArenaRow
        arena={arena({})}
        {...baseProps()}
        boardState={{
          status: { kind: "free", title: "Свободна", detail: null, pulse: false },
          isError: false,
        }}
      />,
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Арена 2")).toBeInTheDocument();
    expect(screen.getByText("малый ковёр · у окна")).toBeInTheDocument();
    expect(screen.getByText("Свободна")).toBeInTheDocument();
    expect(screen.getByText("3:00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть площадку" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть табло" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Редактировать" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Убрать в архив" })).toBeInTheDocument();
  });

  it("shows the bout title, detail and a pulsing indicator when a bout is in progress (AC-2)", () => {
    render(
      <ArenaRow
        arena={arena({})}
        {...baseProps()}
        boardState={{
          status: {
            kind: "bout",
            title: "Идёт бой · Кравцов — Ильин",
            detail: "Длинный меч · Пул A · бой 14 из 18 · 3:2",
            pulse: true,
          },
          isError: false,
        }}
      />,
    );

    expect(screen.getByText("Идёт бой · Кравцов — Ильин")).toBeInTheDocument();
    expect(screen.getByText("Длинный меч · Пул A · бой 14 из 18 · 3:2")).toBeInTheDocument();
    const dot = document.querySelector('[data-slot="arena-status-dot"]');
    expect(dot).toHaveClass("motion-safe:animate-pulse");
  });

  it("does not pulse the indicator for non-bout states (AC-3)", () => {
    render(
      <ArenaRow
        arena={arena({})}
        {...baseProps()}
        boardState={{
          status: { kind: "preparing", title: "Пул готовится", detail: "Сабля · Пул B", pulse: false },
          isError: false,
        }}
      />,
    );

    const dot = document.querySelector('[data-slot="arena-status-dot"]');
    expect(dot).not.toHaveClass("motion-safe:animate-pulse");
  });

  it("mutes and strikes the archived row, hides order arrows, shows only Restore (AC-4)", () => {
    render(
      <ArenaRow
        arena={arena({ status: "ARENA_STATUS_ARCHIVED", name: "Арена 4" })}
        {...baseProps()}
        boardState={undefined}
      />,
    );

    expect(screen.getByText("Арена 4")).toHaveClass("line-through");
    expect(screen.getByText("В архиве")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Переместить выше" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Переместить ниже" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Убрать в архив" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Восстановить" })).toBeInTheDocument();
  });

  it("shows 'статус недоступен' when the board query failed (AC-13)", () => {
    render(
      <ArenaRow
        arena={arena({})}
        {...baseProps()}
        boardState={{
          status: { kind: "unknown", title: "—", detail: null, pulse: false },
          isError: true,
        }}
      />,
    );

    expect(screen.getByText("статус недоступен")).toBeInTheDocument();
    // Реквизиты и действия остаются рабочими
    expect(screen.getByText("Арена 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Редактировать" })).toBeInTheDocument();
  });

  it("the row itself has no click handler — actions are explicit controls (AC-11/FR-19)", () => {
    render(
      <ArenaRow
        arena={arena({})}
        {...baseProps()}
        boardState={{
          status: { kind: "free", title: "Свободна", detail: null, pulse: false },
          isError: false,
        }}
      />,
    );

    const row = screen.getByText("Арена 2").closest('[data-slot="table-row"]');
    expect(row).not.toHaveClass("cursor-pointer");
  });
});
