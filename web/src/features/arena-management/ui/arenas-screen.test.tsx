// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Arena } from "@/entities/arena/lib/types";
import type { ArenaBoardState } from "../api/use-arena-boards";
import { ArenasScreen } from "./arenas-screen";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

function arena(overrides: Partial<Arena>): Arena {
  return {
    id: "a1",
    tournamentId: "t1",
    name: "Арена 1",
    description: "",
    position: 0,
    status: "ARENA_STATUS_ACTIVE",
    defaultDurationSeconds: 180,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const freeBoard: ArenaBoardState = {
  status: { kind: "free", title: "Свободна", detail: null, pulse: false },
  isError: false,
};
const boutBoard: ArenaBoardState = {
  status: { kind: "bout", title: "Идёт бой", detail: null, pulse: true },
  isError: false,
};

let arenasState: { data: Arena[]; isLoading: boolean; error: Error | null } = {
  data: [],
  isLoading: false,
  error: null,
};
const arenasRefetch = vi.fn();

vi.mock("../api/use-arenas", () => ({
  useArenas: () => ({ ...arenasState, refetch: arenasRefetch }),
}));

let boardStatesResult = new Map<string, ArenaBoardState>();
vi.mock("../api/use-arena-boards", () => ({
  useArenaBoards: () => boardStatesResult,
}));

type MutateOpts<T = unknown> = { onSuccess?: (r?: T) => void; onError?: (e: Error) => void };

const reorderMutate = vi.fn();
vi.mock("../api/use-reorder-arenas", () => ({
  useReorderArenas: () => ({ mutate: reorderMutate, isPending: false }),
}));

let archiveResult: { ok: true } | { ok: false; error: string } = { ok: true };
const archiveMutate = vi.fn((_id: string, opts?: MutateOpts) => {
  if (archiveResult.ok) opts?.onSuccess?.();
  else opts?.onError?.(new Error(archiveResult.error));
});
vi.mock("../api/use-archive-arena", () => ({
  useArchiveArena: () => ({ mutate: archiveMutate, isPending: false, variables: undefined }),
}));

const restoreMutate = vi.fn((_id: string, opts?: MutateOpts) => opts?.onSuccess?.());
vi.mock("../api/use-restore-arena", () => ({
  useRestoreArena: () => ({ mutate: restoreMutate, isPending: false, variables: undefined }),
}));

vi.mock("../api/use-create-arena", () => ({
  useCreateArena: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastUndo = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
  toastUndo: (...args: unknown[]) => toastUndo(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  arenasState = { data: [], isLoading: false, error: null };
  boardStatesResult = new Map();
  archiveResult = { ok: true };
});

describe("ArenasScreen", () => {
  it("fills the section header: crumb with tournament name, title, and occupied count (AC-5)", () => {
    const arenas = Array.from({ length: 5 }, (_, i) => arena({ id: `a${i}`, name: `Арена ${i}` }));
    arenasState = { data: arenas, isLoading: false, error: null };
    boardStatesResult = new Map([
      ["a0", boutBoard],
      ["a1", boutBoard],
      ["a2", freeBoard],
      ["a3", freeBoard],
      ["a4", freeBoard],
    ]);

    render(<ArenasScreen tournamentId="t1" tournamentName="Клинок Севера 2026" />);

    const header = document.querySelector('[data-slot="page-header"]') as HTMLElement;
    expect(within(header).getByText("ПЛОЩАДКИ · КЛИНОК СЕВЕРА 2026")).toBeInTheDocument();
    expect(within(header).getByText("Площадки")).toBeInTheDocument();
    expect(within(header).getByText("5 площадок · 2 заняты")).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: /Площадка/ })).toBeInTheDocument();
  });

  it("shows only 'ПЛОЩАДКИ' in the crumb without an active tournament", () => {
    render(<ArenasScreen tournamentId="t1" />);
    expect(screen.getByText("ПЛОЩАДКИ")).toBeInTheDocument();
  });

  it("shows the archived checkbox labelled with the archived count (AC-1)", () => {
    arenasState = {
      data: [
        arena({ id: "a1", name: "Активная" }),
        arena({ id: "a2", name: "Архивная", status: "ARENA_STATUS_ARCHIVED" }),
      ],
      isLoading: false,
      error: null,
    };
    boardStatesResult = new Map([["a1", freeBoard]]);

    render(<ArenasScreen tournamentId="t1" />);

    expect(screen.getByText(/Показать архивные/)).toHaveTextContent("1");
    expect(screen.queryByText("Архивная")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Показать архивные/ }));
    expect(screen.getByText("Архивная")).toBeInTheDocument();
  });

  it("swaps only the two neighboring active arenas, leaving the archived one's slot untouched (AC-12)", () => {
    arenasState = {
      data: [
        arena({ id: "act1", name: "Первая", position: 0 }),
        arena({ id: "arc", name: "Архивная", position: 1, status: "ARENA_STATUS_ARCHIVED" }),
        arena({ id: "act2", name: "Вторая", position: 2 }),
      ],
      isLoading: false,
      error: null,
    };
    boardStatesResult = new Map([
      ["act1", freeBoard],
      ["act2", freeBoard],
    ]);

    render(<ArenasScreen tournamentId="t1" />);

    const upButtons = screen.getAllByRole("button", { name: "Переместить выше" });
    fireEvent.click(upButtons[1]);

    expect(reorderMutate).toHaveBeenCalledWith(["act2", "arc", "act1"]);
  });

  it("archiving shows an undo toast that restores the arena on click (AC-9)", () => {
    arenasState = { data: [arena({ id: "a1" })], isLoading: false, error: null };
    boardStatesResult = new Map([["a1", freeBoard]]);

    render(<ArenasScreen tournamentId="t1" />);

    fireEvent.click(screen.getByRole("button", { name: "Убрать в архив" }));

    expect(archiveMutate).toHaveBeenCalledWith("a1", expect.anything());
    expect(toastUndo).toHaveBeenCalledTimes(1);
    const [, options] = toastUndo.mock.calls[0] as [string, { onUndo: () => void }];
    options.onUndo();
    expect(restoreMutate).toHaveBeenCalledWith("a1", expect.anything());
  });

  it("shows the gate error toast without a retry action when archiving a seated arena fails (AC-10)", () => {
    archiveResult = { ok: false, error: "На площадке стоит пул — сначала снимите его на странице площадки" };
    arenasState = { data: [arena({ id: "a1" })], isLoading: false, error: null };
    boardStatesResult = new Map([["a1", boutBoard]]);

    render(<ArenasScreen tournamentId="t1" />);

    fireEvent.click(screen.getByRole("button", { name: "Убрать в архив" }));

    expect(toastError).toHaveBeenCalledTimes(1);
    const [message, options] = toastError.mock.calls[0] as [string, { retry?: () => void } | undefined];
    expect(message).toBe("На площадке стоит пул — сначала снимите его на странице площадки");
    expect(options?.retry).toBeUndefined();
  });

  it("shows loading skeleton and a retryable load error", () => {
    arenasState = { data: [], isLoading: true, error: null };
    const { unmount } = render(<ArenasScreen tournamentId="t1" />);
    expect(document.querySelectorAll('[data-slot="skeleton-row"]').length).toBeGreaterThan(0);
    unmount();

    arenasState = { data: [], isLoading: false, error: new Error("Сеть недоступна") };
    render(<ArenasScreen tournamentId="t1" />);
    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(arenasRefetch).toHaveBeenCalledTimes(1);
  });
});
