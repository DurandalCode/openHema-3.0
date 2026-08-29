// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConsoleNominationRow } from "./console-nomination-row";
import type { ConsoleNomination } from "@/entities/tournament-console/lib/types";

function baseNomination(overrides: Partial<ConsoleNomination> = {}): ConsoleNomination {
  return {
    nominationId: "n1",
    title: "Длинный меч",
    position: 1,
    phase: "running",
    currentStageTitle: "Группа A",
    boutTotal: 10,
    boutFinished: 4,
    boutRemainingUnseated: 0,
    expectedFinishAt: null,
    provisional: false,
    ...overrides,
  };
}

describe("ConsoleNominationRow (спека 0043, FR-12)", () => {
  afterEach(() => {
    cleanup();
  });

  it("показывает прогресс боёв и текущий этап", () => {
    render(<ConsoleNominationRow nomination={baseNomination()} />);
    expect(screen.getByText("Длинный меч")).toBeInTheDocument();
    expect(screen.getByText("идёт")).toBeInTheDocument();
    expect(screen.getByText(/Группа A/)).toBeInTheDocument();
    expect(screen.getByText("4 из 10")).toBeInTheDocument();
  });

  it("показывает остаток непоставленных боёв числом (FR-9)", () => {
    render(<ConsoleNominationRow nomination={baseNomination({ boutRemainingUnseated: 3 })} />);
    expect(screen.getByText("4 из 10 (+3 не поставлено)")).toBeInTheDocument();
  });

  it("не показывает остаток, когда все пулы поставлены", () => {
    render(<ConsoleNominationRow nomination={baseNomination({ boutRemainingUnseated: 0 })} />);
    expect(screen.queryByText(/не поставлено/)).not.toBeInTheDocument();
  });

  it("ссылка ведёт на схему этапов номинации", () => {
    render(<ConsoleNominationRow nomination={baseNomination({ nominationId: "n42" })} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/nominations/n42/stages");
  });

  it("прогноз не рендерится без ExpectedFinishAt (нет поставленных пулов с непроведёнными боями)", () => {
    render(<ConsoleNominationRow nomination={baseNomination({ expectedFinishAt: null })} />);
    expect(screen.queryByText(/ориентировочно/)).not.toBeInTheDocument();
  });
});
