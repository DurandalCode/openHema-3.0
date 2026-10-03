// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PoolResultsTabs } from "./pool-results-tabs";
import type { BoardBout, FighterRef, PoolStanding, PoolStatus } from "@/entities/pool/lib/types";

const A: FighterRef = { fighterId: "f1", name: "Иван Иванов", club: "Клуб А" };
const B: FighterRef = { fighterId: "f2", name: "Пётр Петров", club: "" };

function bout(overrides: Partial<BoardBout> = {}): BoardBout {
  return {
    id: "b1",
    roundNumber: 1,
    sequenceNumber: 1,
    fighterA: A,
    fighterB: B,
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    ...overrides,
  };
}

function standing(fighter: FighterRef, place: number): PoolStanding {
  return { fighter, wins: 1, draws: 0, losses: 0, pointsScored: 5, pointsConceded: 2, place };
}

type Props = {
  status: PoolStatus;
  standings: PoolStanding[];
  bouts: BoardBout[];
  currentBoutId: string;
};

function view(props: Partial<Props> = {}) {
  const all: Props = {
    status: "POOL_STATUS_ACTIVE",
    standings: [],
    bouts: [bout()],
    currentBoutId: "",
    ...props,
  };
  return <PoolResultsTabs members={[A, B]} {...all} />;
}

const boutsTab = () => screen.getByRole("tab", { name: /Бои/ });
const standingsTab = () => screen.getByRole("tab", { name: /Рейтинг/ });

describe("PoolResultsTabs (спека 0061)", () => {
  afterEach(cleanup);

  it("AC-1/2: идущая группа открыта на «Бои», переключение показывает рейтинг", () => {
    render(view({ standings: [standing(A, 1)] }));

    expect(boutsTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Иван Иванов/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    fireEvent.mouseDown(standingsTab());

    expect(standingsTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText(/Бой 1/)).not.toBeInTheDocument();
  });

  it("AC-3: до первого итога «Рейтинг» — список бойцов без мест и подпись", () => {
    render(view({ status: "POOL_STATUS_READY", standings: [] }));

    expect(standingsTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Иван Иванов")).toBeInTheDocument();
    expect(screen.getByText("(Клуб А)")).toBeInTheDocument();
    expect(screen.getByText("Пётр Петров")).toBeInTheDocument();
    expect(screen.getByText("Итогов пока нет")).toBeInTheDocument();

    // «Бои» доступны и показывают сформированные пары.
    fireEvent.mouseDown(boutsTab());
    expect(boutsTab()).toHaveAttribute("aria-selected", "true");
  });

  it("AC-5: завершённая группа открыта на «Рейтинге» с таблицей", () => {
    render(view({ status: "POOL_STATUS_FINISHED", standings: [standing(A, 1), standing(B, 2)] }));

    expect(standingsTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("Итогов пока нет")).not.toBeInTheDocument();
  });

  it("AC-6: без выбора пользователя вкладка следует за статусом группы", () => {
    const { rerender } = render(view({ status: "POOL_STATUS_READY" }));
    expect(standingsTab()).toHaveAttribute("aria-selected", "true");

    rerender(view({ status: "POOL_STATUS_ACTIVE" }));
    expect(boutsTab()).toHaveAttribute("aria-selected", "true");

    rerender(view({ status: "POOL_STATUS_FINISHED", standings: [standing(A, 1)] }));
    expect(standingsTab()).toHaveAttribute("aria-selected", "true");
  });

  it("AC-4/AC-7: ручной выбор переживает смену статуса, данные обновляются", () => {
    const { rerender } = render(view({ status: "POOL_STATUS_ACTIVE" }));
    fireEvent.mouseDown(standingsTab());
    expect(screen.getByText("Итогов пока нет")).toBeInTheDocument();

    rerender(view({ status: "POOL_STATUS_ACTIVE", standings: [standing(A, 1)] }));
    expect(standingsTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table")).toBeInTheDocument();

    rerender(view({ status: "POOL_STATUS_FINISHED", standings: [standing(A, 1)] }));
    fireEvent.mouseDown(boutsTab());
    rerender(view({ status: "POOL_STATUS_FINISHED", standings: [standing(A, 1)] }));
    expect(boutsTab()).toHaveAttribute("aria-selected", "true");
  });

  it("FR-7: роли tablist/tab/tabpanel", () => {
    render(view());

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });
});
