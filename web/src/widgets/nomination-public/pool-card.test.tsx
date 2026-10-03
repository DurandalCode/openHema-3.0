// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PoolCard } from "./pool-card";
import type { LivePoolDto } from "@/entities/nomination-live/lib/types";
import type { BoardBout } from "@/entities/pool/lib/types";

function bout(overrides: Partial<BoardBout>): BoardBout {
  return {
    id: "b1",
    roundNumber: 1,
    sequenceNumber: 1,
    fighterA: { fighterId: "f1", name: "Иван Иванов", club: "" },
    fighterB: { fighterId: "f2", name: "Пётр Петров", club: "" },
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    ...overrides,
  };
}

function livePool(overrides: Partial<LivePoolDto["pool"]> = {}, bouts: BoardBout[] = [], currentBoutId = ""): LivePoolDto {
  return {
    pool: {
      id: "pool-1",
      nominationId: "n1",
      nominationName: "Longsword",
      number: 1,
      name: "Пул 1",
      members: [
        { fighterId: "f1", name: "Иван Иванов", club: "Клуб А" },
        { fighterId: "f2", name: "Пётр Петров", club: "" },
      ],
      status: "POOL_STATUS_ACTIVE",
      arenaId: "arena-3",
      arenaName: "Арена 3",
      standings: [],
      ...overrides,
    },
    bouts,
    currentBoutId,
  };
}

describe("PoolCard", () => {
  afterEach(() => {
    cleanup();
  });

  // AC-7: группа из 5 бойцов на «Арене 3», идёт — название, счётчик,
  // площадка, статус с живым маркером, состав с клубами, бои, таблица.
  it("shows name, member count, arena, status and member clubs (AC-7)", () => {
    render(
      <PoolCard
        livePool={livePool({
          members: Array.from({ length: 5 }, (_, i) => ({
            fighterId: `f${i}`,
            name: `Боец ${i}`,
            club: `Клуб ${i}`,
          })),
        })}
      />,
    );
    expect(screen.getByText("Пул 1")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Арена 3")).toBeInTheDocument();
    expect(screen.getByText("идёт")).toBeInTheDocument();
    expect(screen.getByText("Боец 0")).toBeInTheDocument();
    expect(screen.getByText("(Клуб 0)")).toBeInTheDocument();
  });

  // AC-8: площадка не назначена → явная подпись, а не пустое место.
  it("shows an explicit 'not assigned' arena caption when the pool has no arena (AC-8)", () => {
    render(
      <PoolCard
        livePool={livePool({ arenaId: "", arenaName: "", status: "POOL_STATUS_READY" })}
      />,
    );
    expect(screen.getByText("площадка не назначена")).toBeInTheDocument();
    expect(screen.getByText("готов")).toBeInTheDocument();
  });

  it("renders bout rows via BoutRow when the pool has bouts", () => {
    render(
      <PoolCard
        livePool={livePool({}, [bout({ id: "b1", sequenceNumber: 1 }), bout({ id: "b2", sequenceNumber: 2 })], "b2")}
      />,
    );
    expect(screen.getByRole("tab", { name: /Бои/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/1\..*Иван Иванов.*Пётр Петров/)).toBeInTheDocument();
    expect(screen.getByText(/2\..*Иван Иванов.*Пётр Петров/)).toBeInTheDocument();
  });

  // FR-12: раздел «Бои» не рендерится пустым заголовком, если боёв нет.
  it("does not render an empty 'Бои' section header when there are no bouts", () => {
    render(<PoolCard livePool={livePool({}, [])} />);
    expect(screen.queryByText("Бои")).not.toBeInTheDocument();
  });

  it("renders the members section", () => {
    render(<PoolCard livePool={livePool()} />);
    expect(screen.getByText("Состав")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  // Спека 0061, FR-3b: с боями «Состав» уходит во вкладку «Рейтинг».
  it("with bouts replaces the members section by tabs (0061)", () => {
    render(<PoolCard livePool={livePool({}, [bout({})])} />);
    expect(screen.queryByText("Состав")).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  // AC-3: до начала группы — «Рейтинг» со списком бойцов.
  it("opens «Рейтинг» with the member list before the pool starts (0061, AC-3)", () => {
    render(<PoolCard livePool={livePool({ status: "POOL_STATUS_READY" }, [bout({})])} />);
    expect(screen.getByRole("tab", { name: "Рейтинг" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Итогов пока нет")).toBeInTheDocument();
    expect(screen.getByText("Иван Иванов")).toBeInTheDocument();
    expect(screen.getByText("(Клуб А)")).toBeInTheDocument();
  });

  // AC-5/AC-2: завершённая — «Рейтинг» с таблицей; «Бои» доступны.
  it("opens «Рейтинг» with the table when finished and lets switch to bouts (0061, AC-5)", () => {
    render(
      <PoolCard
        livePool={livePool(
          {
            status: "POOL_STATUS_FINISHED",
            standings: [
              {
                fighter: { fighterId: "f1", name: "Иван Иванов", club: "" },
                wins: 1,
                draws: 0,
                losses: 0,
                pointsScored: 5,
                pointsConceded: 2,
                place: 1,
              },
            ],
          },
          [bout({ state: "BOUT_STATE_FINISHED", scoreA: 5, scoreB: 2 })],
        )}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Бои/ }));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("5:2")).toBeInTheDocument();
  });

  it("renders the standings table section when standings are present", () => {
    render(
      <PoolCard
        livePool={livePool({
          members: [],
          standings: [
            {
              fighter: { fighterId: "f1", name: "Иван Иванов", club: "" },
              wins: 2,
              draws: 0,
              losses: 0,
              pointsScored: 10,
              pointsConceded: 3,
              place: 1,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Иван Иванов")).toBeInTheDocument();
  });
});
