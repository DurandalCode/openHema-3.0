// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByText("Бои")).toBeInTheDocument();
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
