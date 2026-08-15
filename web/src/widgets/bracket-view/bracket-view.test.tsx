// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BracketView } from "./bracket-view";
import type { Bracket, BracketHalf, BracketPair, BracketSlot } from "@/entities/bracket/lib/types";
import type { Pool } from "@/entities/pool/lib/types";

const emptyFighter = { fighterId: "", name: "", club: "" };

function pool(overrides: Partial<Pool>): Pool {
  return {
    id: "pool-x",
    nominationId: "n1",
    nominationName: "Longsword",
    number: 1,
    name: "1/4 финала, верхняя половина",
    members: [],
    status: "POOL_STATUS_NOT_READY",
    arenaId: "",
    arenaName: "",
    standings: [],
    ...overrides,
  };
}

function filledSlot(slot: number, name: string, fighterId = `f${slot}`): BracketSlot {
  return {
    slot,
    state: "BRACKET_SLOT_STATE_FILLED",
    fighter: { fighterId, name, club: "" },
    sourceLabel: "",
  };
}

function emptySlot(slot: number): BracketSlot {
  return { slot, state: "BRACKET_SLOT_STATE_EMPTY", fighter: emptyFighter, sourceLabel: "" };
}

function pendingSlot(slot: number, sourceLabel: string): BracketSlot {
  return { slot, state: "BRACKET_SLOT_STATE_PENDING", fighter: emptyFighter, sourceLabel };
}

// Круг «1/4 финала» (2 половины по 2 пары): пара 1 — бой идёт; пара 2 —
// бай (пустой слот уже разрешённой пары); пара 3 — бой завершён; пара 4 —
// обе стороны пусты (каскадный бай, FR-9).
const quarterfinal: BracketHalf[] = [
  {
    half: 1,
    title: "Верхняя половина",
    container: pool({
      id: "pool-qf-1",
      name: "1/4 финала, верхняя половина",
      status: "POOL_STATUS_ACTIVE",
      arenaId: "arena-1",
      arenaName: "Ристалище 1",
    }),
    currentBoutId: "bout-qf1",
    pairs: [
      {
        index: 1,
        slotA: filledSlot(1, "Иван Иванов"),
        slotB: filledSlot(2, "Пётр Петров"),
        bout: {
          id: "bout-qf1",
          roundNumber: 1,
          sequenceNumber: 1,
          fighterA: { fighterId: "f1", name: "Иван Иванов", club: "" },
          fighterB: { fighterId: "f2", name: "Пётр Петров", club: "" },
          state: "BOUT_STATE_IN_PROGRESS",
          scoreA: 3,
          scoreB: 2,
        },
        resolved: false,
      },
      {
        index: 2,
        slotA: filledSlot(3, "Анна Сидорова"),
        slotB: emptySlot(4),
        bout: null,
        resolved: true,
      },
    ],
  },
  {
    half: 2,
    title: "Нижняя половина",
    container: pool({ id: "pool-qf-2", name: "1/4 финала, нижняя половина" }),
    currentBoutId: "",
    pairs: [
      {
        index: 3,
        slotA: filledSlot(5, "Олег Кузнецов"),
        slotB: filledSlot(6, "Мария Волкова"),
        bout: {
          id: "bout-qf3",
          roundNumber: 1,
          sequenceNumber: 1,
          fighterA: { fighterId: "f5", name: "Олег Кузнецов", club: "" },
          fighterB: { fighterId: "f6", name: "Мария Волкова", club: "" },
          state: "BOUT_STATE_FINISHED",
          scoreA: 5,
          scoreB: 1,
        },
        resolved: true,
      },
      {
        index: 4,
        slotA: emptySlot(7),
        slotB: emptySlot(8),
        bout: null,
        resolved: true,
      },
    ],
  },
];

// Полуфинал: пара 1 ждёт победителя пары 1 «1/4 финала» (ещё не сыграна);
// пара 2 уже разрешена баем.
const semifinal: BracketHalf[] = [
  {
    half: 1,
    title: "",
    container: pool({ id: "pool-sf-1", name: "Полуфинал" }),
    currentBoutId: "",
    pairs: [
      {
        index: 1,
        slotA: pendingSlot(1, "Победитель пары 1, 1/4 финала"),
        slotB: filledSlot(2, "Анна Сидорова"),
        bout: null,
        resolved: false,
      },
    ],
  },
  {
    half: 2,
    title: "",
    container: pool({ id: "pool-sf-2", name: "Полуфинал" }),
    currentBoutId: "",
    pairs: [
      {
        index: 2,
        slotA: filledSlot(3, "Олег Кузнецов"),
        slotB: emptySlot(4),
        bout: null,
        resolved: true,
      },
    ],
  },
];

const finalRound: BracketHalf[] = [
  {
    half: 1,
    title: "",
    container: pool({ id: "pool-final", name: "Финал", status: "POOL_STATUS_FINISHED" }),
    currentBoutId: "",
    pairs: [
      {
        index: 1,
        slotA: filledSlot(1, "Олег Кузнецов"),
        slotB: filledSlot(2, "Иван Иванов"),
        bout: {
          id: "bout-final",
          roundNumber: 1,
          sequenceNumber: 1,
          fighterA: { fighterId: "f5", name: "Олег Кузнецов", club: "" },
          fighterB: { fighterId: "f1", name: "Иван Иванов", club: "" },
          state: "BOUT_STATE_FINISHED",
          scoreA: 5,
          scoreB: 4,
        },
        resolved: true,
      },
    ],
  },
];

const thirdPlaceRound: BracketHalf[] = [
  {
    half: 1,
    title: "",
    container: pool({ id: "pool-bronze", name: "Бой за 3-е место", status: "POOL_STATUS_FINISHED" }),
    currentBoutId: "",
    pairs: [
      {
        index: 1,
        slotA: filledSlot(1, "Пётр Петров"),
        slotB: filledSlot(2, "Мария Волкова"),
        bout: {
          id: "bout-bronze",
          roundNumber: 1,
          sequenceNumber: 1,
          fighterA: { fighterId: "f2", name: "Пётр Петров", club: "" },
          fighterB: { fighterId: "f6", name: "Мария Волкова", club: "" },
          state: "BOUT_STATE_FINISHED",
          scoreA: 5,
          scoreB: 3,
        },
        resolved: true,
      },
    ],
  },
];

const bracket: Bracket = {
  stage: {
    id: "stage-1",
    nominationId: "n1",
    position: 1,
    title: "Плейофф",
    type: "STAGE_TYPE_BRACKET",
    status: "POOL_LAYOUT_STATUS_READY",
    bracket: { size: 8, thirdPlace: true },
    groups: null,
    rule: null,
    executionStatus: "STAGE_STATUS_UNSPECIFIED",
  },
  rounds: [
    { number: 1, title: "1/4 финала", thirdPlace: false, halves: quarterfinal },
    { number: 2, title: "Полуфинал", thirdPlace: false, halves: semifinal },
    { number: 3, title: "Финал", thirdPlace: false, halves: finalRound },
    { number: 4, title: "Бой за 3-е место", thirdPlace: true, halves: thirdPlaceRound },
  ],
  unassigned: [],
  canUndo: false,
  champion: { fighterId: "f5", name: "Олег Кузнецов", club: "" },
  thirdPlaceWinner: { fighterId: "f2", name: "Пётр Петров", club: "" },
};

describe("BracketView", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders round titles and pair participants", () => {
    render(<BracketView bracket={bracket} />);

    expect(screen.getByText("1/4 финала")).toBeInTheDocument();
    expect(screen.getAllByText("Полуфинал").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Финал").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Иван Иванов").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Пётр Петров").length).toBeGreaterThan(0);
  });

  it("shows the source-pair label for a pending slot (FR-13)", () => {
    render(<BracketView bracket={bracket} />);
    expect(screen.getByText("Победитель пары 1, 1/4 финала")).toBeInTheDocument();
  });

  // FR-9: пустой слот уже разрешённой пары — бай.
  it("labels an empty slot of a resolved pair as a bye", () => {
    render(<BracketView bracket={bracket} />);
    expect(screen.getAllByText("Бай").length).toBeGreaterThan(0);
  });

  it("shows the score and state of a materialized bout", () => {
    render(<BracketView bracket={bracket} />);
    expect(screen.getByText("3:2")).toBeInTheDocument();
    expect(screen.getByText("5:1")).toBeInTheDocument();
    expect(screen.getAllByText("идёт").length).toBeGreaterThan(0);
    expect(screen.getAllByText("завершён").length).toBeGreaterThan(0);
  });

  it("shows the arena and executive status of a half", () => {
    render(<BracketView bracket={bracket} />);
    expect(screen.getByText("Ристалище 1")).toBeInTheDocument();
    expect(screen.getByText("1/4 финала, верхняя половина")).toBeInTheDocument();
  });

  it("shows the champion and the third place winner (FR-20)", () => {
    render(<BracketView bracket={bracket} />);
    expect(screen.getAllByText(/Олег Кузнецов/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Чемпион/i)).toBeInTheDocument();
    expect(screen.getAllByText(/3-е место/i).length).toBeGreaterThan(0);
  });

  it("does not render champion/third place badges when not decided yet", () => {
    const draft: Bracket = { ...bracket, champion: null, thirdPlaceWinner: null };
    render(<BracketView bracket={draft} />);
    expect(screen.queryByText(/Чемпион/i)).not.toBeInTheDocument();
  });

  // NFR-2: сетка любого размера (до 32 слотов) не должна ломать экран
  // горизонтальной «простынёй» — круги скроллятся горизонтально вместо
  // растягивания страницы.
  it("wraps rounds in a horizontally scrollable container (NFR-2)", () => {
    const { container } = render(<BracketView bracket={bracket} />);
    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
  });
});
