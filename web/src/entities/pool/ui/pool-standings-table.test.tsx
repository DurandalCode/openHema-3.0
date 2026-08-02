// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PoolStandingsTable } from "./pool-standings-table";
import type { PoolStanding } from "@/entities/pool/lib/types";

function standing(partial: Partial<PoolStanding> & { fighterId: string }): PoolStanding {
  return {
    fighter: { fighterId: partial.fighterId, name: partial.fighterId, club: "" },
    wins: 0,
    draws: 0,
    losses: 0,
    pointsScored: 0,
    pointsConceded: 0,
    place: 1,
    ...partial,
  };
}

describe("PoolStandingsTable", () => {
  it("renders nothing when standings is empty (FR-7)", () => {
    const { container } = render(<PoolStandingsTable standings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders rows in the given order without re-sorting (FR-8: server is the source of order)", () => {
    const standings: PoolStanding[] = [
      standing({ fighterId: "f1", place: 1, wins: 2, draws: 0, losses: 0, pointsScored: 10, pointsConceded: 2 }),
      standing({ fighterId: "f2", place: 2, wins: 1, draws: 0, losses: 1, pointsScored: 6, pointsConceded: 5 }),
    ];

    render(<PoolStandingsTable standings={standings} />);

    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("f1");
    expect(rows[1]).toHaveTextContent("f2");
  });

  it("shows club next to fighter name when present", () => {
    const standings: PoolStanding[] = [
      {
        fighter: { fighterId: "f1", name: "Fighter One", club: "Sokol" },
        wins: 1,
        draws: 0,
        losses: 0,
        pointsScored: 5,
        pointsConceded: 2,
        place: 1,
      },
    ];

    render(<PoolStandingsTable standings={standings} />);

    expect(screen.getByText("Fighter One")).toBeInTheDocument();
    expect(screen.getByText("(Sokol)")).toBeInTheDocument();
  });
});
