// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BoutRow } from "./bout-row";
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

describe("BoutRow", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the sequence number and fighter pair", () => {
    render(<BoutRow bout={bout({})} isCurrent={false} />);
    expect(screen.getByText(/1\..*Иван Иванов.*Пётр Петров/)).toBeInTheDocument();
  });

  // Спека 0035, FR-13/AC-9: не начатый бой — прочерк, не нули.
  it("shows a dash score and 'не начат' state for a not-started bout (AC-9)", () => {
    render(<BoutRow bout={bout({ state: "BOUT_STATE_NOT_STARTED" })} isCurrent={false} />);
    expect(screen.getByText("—:—")).toBeInTheDocument();
    expect(screen.getByText("не начат")).toBeInTheDocument();
  });

  // AC-10: идущий бой выделен и показывает фактический счёт.
  it("highlights the current bout and shows the actual score (AC-10)", () => {
    const { container } = render(
      <BoutRow
        bout={bout({ id: "b3", sequenceNumber: 3, state: "BOUT_STATE_IN_PROGRESS", scoreA: 3, scoreB: 1 })}
        isCurrent
      />,
    );
    expect(screen.getByText("3:1")).toBeInTheDocument();
    expect(screen.getByText("идёт")).toBeInTheDocument();
    expect(container.querySelector('[data-current="true"]')).not.toBeNull();
  });

  // AC-11: завершённый бой показывает счёт, состояние и исход.
  it("shows the score, state and winner outcome for a finished bout (AC-11)", () => {
    render(<BoutRow bout={bout({ state: "BOUT_STATE_FINISHED", scoreA: 5, scoreB: 2 })} isCurrent={false} />);
    expect(screen.getByText("5:2")).toBeInTheDocument();
    expect(screen.getByText("завершён")).toBeInTheDocument();
    expect(screen.getByText(/Исход:\s*Иван Иванов/)).toBeInTheDocument();
  });

  it("shows a draw outcome for a finished bout with equal scores", () => {
    render(<BoutRow bout={bout({ state: "BOUT_STATE_FINISHED", scoreA: 3, scoreB: 3 })} isCurrent={false} />);
    expect(screen.getByText(/Исход:\s*ничья/)).toBeInTheDocument();
  });

  it("does not show an outcome line for a bout that hasn't finished", () => {
    render(<BoutRow bout={bout({ state: "BOUT_STATE_IN_PROGRESS", scoreA: 1, scoreB: 0 })} isCurrent={false} />);
    expect(screen.queryByText(/Исход/)).not.toBeInTheDocument();
  });
});
