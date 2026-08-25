// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TournamentProgram } from "./tournament-program";
import type { TournamentProgramDay } from "../lib/types";

describe("entities/tournament/ui TournamentProgram (spec 0040, FR-14/FR-15/FR-16)", () => {
  afterEach(cleanup);

  it("renders nothing when program is empty (FR-16)", () => {
    const { container } = render(<TournamentProgram program={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders days with their items in the given order (AC-10)", () => {
    const program: TournamentProgramDay[] = [
      {
        date: "2026-12-01",
        items: [
          { timeLabel: "9:00", text: "Сбор участников" },
          { timeLabel: "10:00", text: "Начало номинаций" },
        ],
      },
      {
        date: "2026-12-02",
        items: [{ timeLabel: "10:00", text: "Финалы" }],
      },
    ];

    render(<TournamentProgram program={program} />);

    expect(screen.getByText("Сбор участников")).toBeInTheDocument();
    expect(screen.getByText("Начало номинаций")).toBeInTheDocument();
    expect(screen.getByText("Финалы")).toBeInTheDocument();
    expect(screen.getByText("9:00")).toBeInTheDocument();

    const texts = screen
      .getAllByTestId("tournament-program-item")
      .map((el) => el.textContent);
    expect(texts).toEqual([
      "9:00Сбор участников",
      "10:00Начало номинаций",
      "10:00Финалы",
    ]);
  });

  it("renders an item without a time label without leaving an empty node", () => {
    const program: TournamentProgramDay[] = [
      { date: "2026-12-01", items: [{ timeLabel: "", text: "Открытие" }] },
    ];

    render(<TournamentProgram program={program} />);
    expect(screen.getByText("Открытие")).toBeInTheDocument();
  });

  it("uses a custom title when provided", () => {
    render(
      <TournamentProgram
        program={[{ date: "2026-12-01", items: [{ timeLabel: "9:00", text: "Сбор" }] }]}
        title="Расписание"
      />,
    );
    expect(screen.getByText("Расписание")).toBeInTheDocument();
  });
});
