// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bracket, BracketPair, BracketSlot } from "../lib/types";
import { BracketGraph } from "./bracket-graph";

const fighter = (id: string, name: string) => ({ fighterId: id, name, club: "" });
const filled = (slot: number, id: string, name: string): BracketSlot => ({
  slot, state: "BRACKET_SLOT_STATE_FILLED", fighter: fighter(id, name), sourceLabel: "",
});
const pending = (slot: number, label: string): BracketSlot => ({
  slot, state: "BRACKET_SLOT_STATE_PENDING", fighter: fighter("", ""), sourceLabel: label,
});
const empty = (slot: number): BracketSlot => ({
  slot, state: "BRACKET_SLOT_STATE_EMPTY", fighter: fighter("", ""), sourceLabel: "",
});
const pair = (index: number, a: BracketSlot, b: BracketSlot, resolved = false): BracketPair => ({
  index, slotA: a, slotB: b, bout: null, resolved,
});

function fixture(): Bracket {
  const basePool = {
    nominationId: "nomination-1", nominationName: "Шпага", number: 1,
    members: [], status: "POOL_STATUS_ACTIVE" as const, arenaId: "", arenaName: "", standings: [],
  };
  return {
    stage: {
      id: "stage-1", nominationId: "nomination-1", position: 1, title: "Плейофф",
      type: "STAGE_TYPE_BRACKET", status: "POOL_LAYOUT_STATUS_READY",
      bracket: { size: 4, thirdPlace: true }, groups: null, rule: null,
      executionStatus: "STAGE_STATUS_UNSPECIFIED",
    },
    rounds: [
      { number: 1, title: "Полуфинал", thirdPlace: false, halves: [
        { half: 1, title: "Верхняя половина", container: {
          ...basePool, id: "semi-upper", name: "Полуфинал, верхняя половина",
          arenaId: "arena-1", arenaName: "Ристалище 1",
        }, currentBoutId: "bout-1", pairs: [{
          ...pair(1, filled(1, "a", "Очень длинное имя участника А"), filled(2, "b", "Участник Б")),
          bout: {
            id: "bout-1", roundNumber: 1, sequenceNumber: 1,
            fighterA: fighter("a", "Очень длинное имя участника А"),
            fighterB: fighter("b", "Участник Б"),
            state: "BOUT_STATE_IN_PROGRESS", scoreA: 3, scoreB: 2,
          },
        }] },
        { half: 2, title: "Нижняя половина", container: {
          ...basePool, id: "semi-lower", name: "Полуфинал, нижняя половина",
        }, currentBoutId: "", pairs: [pair(2, filled(3, "c", "Участник В"), empty(4), true)] },
      ] },
      { number: 2, title: "Финал", thirdPlace: false, halves: [{
        half: 1, title: "", container: { ...basePool, id: "final", name: "Финал" },
        currentBoutId: "", pairs: [pair(1, pending(1, "Победитель пары 1, полуфинал"), filled(2, "c", "Участник В"))],
      }] },
      { number: 3, title: "Бой за 3-е место", thirdPlace: true, halves: [{
        half: 1, title: "", container: { ...basePool, id: "bronze", name: "Бой за 3-е место" },
        currentBoutId: "", pairs: [pair(1, pending(1, "Проигравший пары 1, полуфинал"), empty(2))],
      }] },
    ],
    unassigned: [], canUndo: false, champion: null, thirdPlaceWinner: null,
  };
}

describe("BracketGraph", () => {
  afterEach(() => cleanup());

  it("renders graph cards, source descriptions, states, scores and both halves", () => {
    const { container } = render(<BracketGraph bracket={fixture()} />);
    expect(screen.getByText("Очень длинное имя участника А")).toBeInTheDocument();
    expect(screen.getByText("Победитель пары 1, полуфинал")).toBeInTheDocument();
    expect(screen.getByText("Проигравший пары 1, полуфинал")).toBeInTheDocument();
    expect(screen.getByText("3:2")).toBeInTheDocument();
    expect(screen.getByText("Ристалище 1")).toBeInTheDocument();
    expect(screen.getByText("Полуфинал, верхняя половина")).toBeInTheDocument();
    expect(screen.getByText("Полуфинал, нижняя половина")).toBeInTheDocument();
    expect(screen.getAllByText("Бай")).toHaveLength(1);
    expect(screen.getByText("Нет участника")).toBeInTheDocument();
    expect(container.querySelector('[data-current="true"]')).not.toBeNull();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole("region", { name: "Граф плей-офф, прокручиваемая область" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Переход к кругу" })).toBeInTheDocument();
    expect(screen.getByText(/Проигравшие полуфиналов идут в бой за 3-е место/)).toBeInTheDocument();
    expect(screen.getByText(/Победитель пары 1, полуфинал → финал, сторона А/)).toBeInTheDocument();
  });

  it("navigates to a round and preserves scroll when results update", () => {
    const bracket = fixture();
    const { container, rerender } = render(<BracketGraph bracket={bracket} />);
    const viewport = container.querySelector('[data-testid="bracket-graph-viewport"]') as HTMLElement;
    const target = container.querySelector('[data-round="2"]') as HTMLElement;
    Object.defineProperty(target, "offsetLeft", { configurable: true, value: 420 });
    fireEvent.click(screen.getByRole("button", { name: "К кругу Финал" }));
    expect(viewport.scrollLeft).toBe(420);
    const bronzeHeading = container.querySelector('[data-round="3"]') as HTMLElement;
    Object.defineProperty(bronzeHeading, "offsetLeft", { configurable: true, value: 420 });
    Object.defineProperty(bronzeHeading, "offsetTop", { configurable: true, value: 340 });
    fireEvent.click(screen.getByRole("button", { name: "К кругу Бой за 3-е место" }));
    expect(viewport.scrollTop).toBe(340);
    viewport.scrollTop = 150;
    rerender(<BracketGraph bracket={{ ...bracket, rounds: bracket.rounds.map((round) => ({ ...round })) }} />);
    expect(viewport.scrollLeft).toBe(420);
    expect(viewport.scrollTop).toBe(150);
    rerender(<BracketGraph bracket={{ ...bracket, stage: { ...bracket.stage, id: "other-stage" } }} />);
    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.scrollTop).toBe(0);
  });

  it("keeps the graph inside a two-axis scroll container and hides bronze when absent", () => {
    const bracket = fixture();
    bracket.rounds = bracket.rounds.filter((round) => !round.thirdPlace);
    const { container } = render(<BracketGraph bracket={bracket} />);
    const viewport = container.querySelector('[data-testid="bracket-graph-viewport"]');
    expect(viewport).toHaveClass("overflow-auto");
    expect(container.querySelector('[data-emphasis="third-place"]')).toBeNull();
    expect(container.querySelectorAll('[data-edge-kind="loser"]')).toHaveLength(0);
    expect(screen.queryByText(/Проигравшие полуфиналов идут/)).not.toBeInTheDocument();
  });

  it("does not award a bye to an empty draft pair", () => {
    const bracket = fixture();
    bracket.stage = { ...bracket.stage, status: "POOL_LAYOUT_STATUS_DRAFT" };
    bracket.rounds[0].halves[1].pairs = [pair(2, empty(3), empty(4), true)];
    render(<BracketGraph bracket={bracket} />);
    expect(screen.getAllByText("Нет участника")).toHaveLength(3);
    expect(screen.queryByText("Бай")).not.toBeInTheDocument();
  });

  it("recalculates measured card height without inventing a score", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    };
    try {
      const { container } = render(<BracketGraph bracket={fixture()} />);
      expect(observe).toHaveBeenCalled();
      expect(container.querySelector('[data-round="2"]')).not.toBeNull();
      expect(screen.queryByText("0:0")).not.toBeInTheDocument();
    } finally {
      globalThis.ResizeObserver = original;
    }
  });

  it("draws two winner and two loser connectors after real card dimensions are available", () => {
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 260, bottom: 180,
      width: 260, height: 180, toJSON: () => ({}),
    });
    try {
      const { container } = render(<BracketGraph bracket={fixture()} />);
      expect(container.querySelectorAll('[data-edge-kind="winner"]')).toHaveLength(2);
      expect(container.querySelectorAll('[data-edge-kind="loser"]')).toHaveLength(2);
    } finally {
      rect.mockRestore();
    }
  });
});
