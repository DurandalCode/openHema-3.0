// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "@/entities/pool/lib/types";
import { PoolSeating } from "./pool-seating";
import { UnauthorizedError } from "@/shared/api/unauthorized";

afterEach(() => {
  cleanup();
});

function fighter(id: string, name: string) {
  return { fighterId: id, name, club: "" };
}

function pool(overrides: Partial<Pool>): Pool {
  return {
    id: "p1",
    nominationId: "n1",
    nominationName: "Лонгсворд",
    number: 1,
    name: "Пул 1",
    members: [fighter("f1", "Ясь В."), fighter("f2", "Круглов С.")],
    status: "POOL_STATUS_READY",
    arenaId: "",
    arenaName: "",
    standings: [],
    ...overrides,
  };
}

let poolsState: {
  data: { seated: Pool | null; available: Pool[] } | undefined;
  isLoading: boolean;
  error: Error | null;
} = { data: { seated: null, available: [] }, isLoading: false, error: null };

const seatMutate = vi.fn();
const unseatMutate = vi.fn();

vi.mock("../api/use-pools-for-arena", () => ({
  usePoolsForArena: () => poolsState,
}));
vi.mock("../api/use-seat-pool", () => ({
  useSeatPool: () => ({ mutate: seatMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-unseat-pool", () => ({
  useUnseatPool: () => ({ mutate: unseatMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-bouts-for-nomination", () => ({
  useBoutsForNomination: () => ({ data: [] }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  poolsState = { data: { seated: null, available: [] }, isLoading: false, error: null };
});

describe("PoolSeating — постановка пула (спека 0033, FR-12..FR-14)", () => {
  it("FR-12: shows ready pool cards with nomination badge and member count", () => {
    poolsState.data = { seated: null, available: [pool({})] };

    render(<PoolSeating arenaId="a1" />);

    expect(screen.getByText("Пул 1")).toBeInTheDocument();
    // "Лонгсворд" appears both as the nomination badge on the card and as
    // its filter chip label (FR-13) — assert both are present.
    expect(screen.getAllByText("Лонгсворд")).toHaveLength(2);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("AC-6: filters the list by nomination chip, and 'Все номинации' restores the full list", () => {
    const longsword = pool({
      id: "p1",
      name: "Пул 1",
      nominationId: "n1",
      nominationName: "Лонгсворд",
    });
    const rapier = pool({
      id: "p2",
      name: "Пул 2",
      nominationId: "n2",
      nominationName: "Рапира",
    });
    poolsState.data = { seated: null, available: [longsword, rapier] };

    render(<PoolSeating arenaId="a1" />);

    const group = screen.getByRole("group", { name: "Фильтр по номинации" });
    const allChip = within(group).getByRole("button", { name: "Все номинации" });
    const longswordChip = within(group).getByRole("button", { name: "Лонгсворд" });
    const rapierChip = within(group).getByRole("button", { name: "Рапира" });

    // Default selection is "Все номинации", both cards visible.
    expect(allChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Пул 1")).toBeInTheDocument();
    expect(screen.getByText("Пул 2")).toBeInTheDocument();

    fireEvent.click(longswordChip);

    expect(longswordChip).toHaveAttribute("aria-pressed", "true");
    expect(allChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Пул 1")).toBeInTheDocument();
    expect(screen.queryByText("Пул 2")).not.toBeInTheDocument();

    fireEvent.click(rapierChip);
    expect(screen.queryByText("Пул 1")).not.toBeInTheDocument();
    expect(screen.getByText("Пул 2")).toBeInTheDocument();

    fireEvent.click(allChip);
    expect(allChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Пул 1")).toBeInTheDocument();
    expect(screen.getByText("Пул 2")).toBeInTheDocument();
  });

  it("computes nomination chips from available pools, not hardcoded, deduplicating by nominationId", () => {
    const a = pool({ id: "p1", nominationId: "n1", nominationName: "Лонгсворд" });
    const b = pool({ id: "p2", nominationId: "n1", nominationName: "Лонгсворд" });
    poolsState.data = { seated: null, available: [a, b] };

    render(<PoolSeating arenaId="a1" />);

    const group = screen.getByRole("group", { name: "Фильтр по номинации" });
    // Only one nomination chip beside "Все номинации" despite two pools.
    expect(within(group).getAllByRole("button")).toHaveLength(2);
    expect(within(group).getByRole("button", { name: "Лонгсворд" })).toBeInTheDocument();
  });

  it("SF-02: defaults to unfinished pools, keeps the full bracket-half name, and shows status", () => {
    poolsState.data = {
      seated: null,
      available: [
        pool({ id: "ready", name: "1/4 финала — нижняя половина", status: "POOL_STATUS_READY" }),
        pool({ id: "active", name: "Пул в процессе", status: "POOL_STATUS_ACTIVE" }),
        pool({ id: "finished", name: "Завершённый пул", status: "POOL_STATUS_FINISHED" }),
      ],
    };

    render(<PoolSeating arenaId="a1" />);

    const status = screen.getByRole("group", { name: "Фильтр по статусу пула" });
    expect(within(status).getByRole("button", { name: "Незавершённые" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1/4 финала — нижняя половина")).toBeInTheDocument();
    expect(screen.getByText("Пул в процессе")).toBeInTheDocument();
    expect(screen.queryByText("Завершённый пул")).not.toBeInTheDocument();
    expect(screen.getByText("готов")).toBeInTheDocument();
    expect(screen.getByText("идёт")).toBeInTheDocument();
  });

  it("SF-02: combines status and nomination filters, and completed pools remain selectable", () => {
    poolsState.data = {
      seated: null,
      available: [
        pool({ id: "l-ready", name: "Лонгсворд готов", status: "POOL_STATUS_READY" }),
        pool({ id: "l-done", name: "Лонгсворд завершён", status: "POOL_STATUS_FINISHED" }),
        pool({ id: "r-done", name: "Рапира завершена", nominationId: "n2", nominationName: "Рапира", status: "POOL_STATUS_FINISHED" }),
      ],
    };

    render(<PoolSeating arenaId="a1" />);
    const status = screen.getByRole("group", { name: "Фильтр по статусу пула" });
    const nominations = screen.getByRole("group", { name: "Фильтр по номинации" });
    fireEvent.click(within(nominations).getByRole("button", { name: "Лонгсворд" }));
    fireEvent.click(within(status).getByRole("button", { name: "Завершённые" }));

    expect(screen.queryByText("Лонгсворд готов")).not.toBeInTheDocument();
    expect(screen.getByText("Лонгсворд завершён")).toBeInTheDocument();
    expect(screen.queryByText("Рапира завершена")).not.toBeInTheDocument();
    expect(screen.getByText("завершён")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Поставить на эту арену" }));
    expect(seatMutate).toHaveBeenCalledWith("l-done");

    fireEvent.click(within(status).getByRole("button", { name: /^Все$/ }));
    expect(screen.getByText("Лонгсворд готов")).toBeInTheDocument();
    expect(screen.getByText("Лонгсворд завершён")).toBeInTheDocument();
    expect(screen.queryByText("Рапира завершена")).not.toBeInTheDocument();
  });

  it("SF-02: recomputes from refreshed statuses and explains an empty filtered result", () => {
    const selected = pool({ id: "p1", name: "Мой пул", status: "POOL_STATUS_READY" });
    poolsState.data = { seated: null, available: [selected] };
    const { rerender } = render(<PoolSeating arenaId="a1" />);
    const status = screen.getByRole("group", { name: "Фильтр по статусу пула" });
    expect(screen.getByText("Мой пул")).toBeInTheDocument();

    poolsState.data = { seated: null, available: [{ ...selected, status: "POOL_STATUS_FINISHED" }] };
    rerender(<PoolSeating arenaId="a1" />);
    expect(screen.queryByText("Мой пул")).not.toBeInTheDocument();
    expect(screen.getByText("Нет пулов, подходящих под выбранные фильтры")).toBeInTheDocument();
    expect(screen.queryByText("Нет готовых пулов для постановки")).not.toBeInTheDocument();
    fireEvent.click(within(status).getByRole("button", { name: "Завершённые" }));
    expect(screen.getByText("Мой пул")).toBeInTheDocument();

    poolsState.data = { seated: null, available: [{ ...selected, status: "POOL_STATUS_READY" }] };
    rerender(<PoolSeating arenaId="a1" />);
    expect(screen.queryByText("Мой пул")).not.toBeInTheDocument();
    expect(screen.getByText("Нет пулов, подходящих под выбранные фильтры")).toBeInTheDocument();
    fireEvent.click(within(status).getByRole("button", { name: "Незавершённые" }));
    expect(screen.getByText("Мой пул")).toBeInTheDocument();
  });

  it("AC-7: explains where pools come from and links to seeding when there are no ready pools at all", () => {
    poolsState.data = { seated: null, available: [] };

    render(<PoolSeating arenaId="a1" />);

    expect(screen.getByText("Нет готовых пулов для постановки")).toBeInTheDocument();
    expect(
      screen.getByText(/раскладка этапа зафиксирована/),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "К посеву" });
    expect(link).toHaveAttribute("href", "/admin/nominations");
  });

  it("does not show the explaining empty state when the nomination filter excludes all remaining pools (pools as a whole are not empty)", () => {
    const longsword = pool({ id: "p1", nominationId: "n1", nominationName: "Лонгсворд" });
    const rapier = pool({ id: "p2", nominationId: "n2", nominationName: "Рапира" });
    poolsState.data = { seated: null, available: [longsword, rapier] };

    const { rerender } = render(<PoolSeating arenaId="a1" />);

    const group = screen.getByRole("group", { name: "Фильтр по номинации" });
    fireEvent.click(within(group).getByRole("button", { name: "Лонгсворд" }));
    expect(screen.getByText("Пул 1")).toBeInTheDocument();

    // Simulate a refetch that drops the selected nomination's pool while
    // pools overall remain non-empty (e.g. it just got seated elsewhere).
    // The filter (component-local state) stays on "Лонгсворд" — the
    // filtered list is now empty, but `pools.length` is still 1.
    poolsState.data = { seated: null, available: [rapier] };
    rerender(<PoolSeating arenaId="a1" />);

    expect(screen.queryByText("Нет готовых пулов для постановки")).not.toBeInTheDocument();
    expect(screen.queryByText("Пул 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Пул 2")).not.toBeInTheDocument();
    expect(screen.getByText("Нет пулов, подходящих под выбранные фильтры")).toBeInTheDocument();
  });

  it("does not render its own error block when the session expired (spec 0039, FR-18/AC-12)", () => {
    poolsState = { data: undefined, isLoading: false, error: new UnauthorizedError() };

    const { container } = render(<PoolSeating arenaId="a1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
