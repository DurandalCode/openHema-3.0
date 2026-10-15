// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "@/entities/pool/lib/types";
import { ArenaQueue } from "./arena-queue";

afterEach(() => {
  cleanup();
});

vi.mock("../api/use-bouts-for-nomination", () => ({
  useBoutsForNomination: () => ({
    data: [
      { id: "b1", poolId: "p1", sequenceNumber: 1 },
      { id: "b2", poolId: "p1", sequenceNumber: 2 },
      { id: "b3", poolId: "p2", sequenceNumber: 1 },
    ],
  }),
}));

function pool(id: string, overrides: Partial<Pool> = {}): Pool {
  return {
    id,
    nominationId: "n1",
    nominationName: "Лонгсворд",
    number: 1,
    name: `Пул ${id}`,
    members: [],
    status: "POOL_STATUS_READY",
    arenaId: "",
    arenaName: "",
    standings: [],
    stageTitle: "Групповой этап",
    ...overrides,
  };
}

const onSeatNext = vi.fn();
const onReorder = vi.fn();
const onRemove = vi.fn();

function renderQueue(queued: Pool[], props: Partial<React.ComponentProps<typeof ArenaQueue>> = {}) {
  return render(
    <ArenaQueue
      queued={queued}
      canSeatNext={false}
      onSeatNext={onSeatNext}
      onReorder={onReorder}
      onRemove={onRemove}
      pending={false}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ArenaQueue — очередь арены (спека 0063, FR-16)", () => {
  it("shows an explaining empty state when the queue is empty", () => {
    renderQueue([]);

    expect(screen.getByText("Очередь пуста")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Поставить следующий" })).not.toBeInTheDocument();
  });

  it("lists pools in order with number, pool, stage, nomination and bout count", () => {
    renderQueue([pool("p1"), pool("p2", { stageTitle: "Утешительная сетка" })]);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("1")).toBeInTheDocument();
    expect(within(items[0]).getByText("Пул p1")).toBeInTheDocument();
    expect(within(items[0]).getByText("Групповой этап")).toBeInTheDocument();
    expect(within(items[0]).getByText("Лонгсворд")).toBeInTheDocument();
    expect(within(items[0]).getByText("2 боя")).toBeInTheDocument();
    expect(within(items[1]).getByText("2")).toBeInTheDocument();
    expect(within(items[1]).getByText("Утешительная сетка")).toBeInTheDocument();
    expect(within(items[1]).getByText("1 бой")).toBeInTheDocument();
  });

  it("moves a pool up/down by sending the full new order", () => {
    renderQueue([pool("p1"), pool("p2"), pool("p3")]);

    fireEvent.click(screen.getByRole("button", { name: "Выше: Пул p3 · Групповой этап" }));
    expect(onReorder).toHaveBeenLastCalledWith(["p1", "p3", "p2"]);

    fireEvent.click(screen.getByRole("button", { name: "Ниже: Пул p1 · Групповой этап" }));
    expect(onReorder).toHaveBeenLastCalledWith(["p2", "p1", "p3"]);
  });

  it("disables 'up' for the first and 'down' for the last pool", () => {
    renderQueue([pool("p1"), pool("p2")]);

    expect(screen.getByRole("button", { name: "Выше: Пул p1 · Групповой этап" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ниже: Пул p2 · Групповой этап" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Выше: Пул p2 · Групповой этап" })).toBeEnabled();
  });

  it("removes a pool from the queue", () => {
    renderQueue([pool("p1"), pool("p2")]);

    fireEvent.click(screen.getByRole("button", { name: "Убрать из очереди: Пул p2 · Групповой этап" }));

    expect(onRemove).toHaveBeenCalledWith("p2");
  });

  it("FR-9: offers 'Поставить следующий' for the head of the queue only when the arena is free", () => {
    const { rerender } = renderQueue([pool("p1"), pool("p2")], { canSeatNext: true });

    expect(screen.getByText(/Следующий:/)).toHaveTextContent("Следующий: Пул p1");
    fireEvent.click(screen.getByRole("button", { name: "Поставить следующий" }));
    expect(onSeatNext).toHaveBeenCalledTimes(1);

    rerender(
      <ArenaQueue
        queued={[pool("p1")]}
        canSeatNext={false}
        onSeatNext={onSeatNext}
        onReorder={onReorder}
        onRemove={onRemove}
        pending={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Поставить следующий" })).not.toBeInTheDocument();
  });

  it("disables the controls while a queue mutation is pending", () => {
    renderQueue([pool("p1"), pool("p2")], { canSeatNext: true, pending: true });

    expect(screen.getByRole("button", { name: "Ниже: Пул p1 · Групповой этап" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Убрать из очереди: Пул p1 · Групповой этап" })).toBeDisabled();
  });
});
