// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fighter, Participation } from "@/entities/fighter/lib/types";
import { FighterRow } from "./fighter-row";

afterEach(() => {
  cleanup();
});

function participation(nominationId: string, status: Participation["status"] = "PARTICIPATION_STATUS_ACTIVE"): Participation {
  return { nominationId, status };
}

function fighter(overrides: Partial<Fighter>): Fighter {
  return {
    id: "f1",
    tournamentId: "t1",
    name: "Иван Петров",
    club: "Клинок Севера",
    status: "FIGHTER_STATUS_ACTIVE",
    withdrawalReason: "WITHDRAWAL_REASON_UNSPECIFIED",
    participations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fromApplication: true,
    linkedAccountId: "",
    linkedAccountDisplayName: "",
    mergedIntoId: "",
    ...overrides,
  };
}

const nominationTitleById = new Map([
  ["sabre", "Сабля"],
  ["longsword", "Длинный меч"],
  ["rapier", "Рапира"],
  ["dagger", "Кинжал"],
]);

describe("FighterRow", () => {
  it("renders the five columns: name, club, participation, status, origin", () => {
    render(
      <FighterRow
        fighter={fighter({ participations: [participation("sabre")] })}
        nominationTitleById={nominationTitleById}
        onOpenCard={vi.fn()}
      />,
    );

    expect(screen.getByText("Иван Петров")).toBeInTheDocument();
    expect(screen.getByText("Клинок Севера")).toBeInTheDocument();
    expect(screen.getByText("Сабля")).toBeInTheDocument();
    expect(screen.getByText("Активен")).toBeInTheDocument();
    expect(screen.getByText("из заявки")).toBeInTheDocument();
  });

  it("shows a dash in the participation cell when the fighter has no participations (FR-2)", () => {
    render(
      <FighterRow fighter={fighter({})} nominationTitleById={nominationTitleById} onOpenCard={vi.fn()} />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("marks a removed participation as muted with a 'снят' label (FR-2)", () => {
    render(
      <FighterRow
        fighter={fighter({ participations: [participation("sabre", "PARTICIPATION_STATUS_REMOVED")] })}
        nominationTitleById={nominationTitleById}
        onOpenCard={vi.fn()}
      />,
    );

    expect(screen.getByText(/Сабля/)).toBeInTheDocument();
    expect(screen.getByText(/снят/)).toBeInTheDocument();
  });

  it("collapses participation tags beyond the visible limit into a '+N' indicator", () => {
    render(
      <FighterRow
        fighter={fighter({
          participations: [
            participation("sabre"),
            participation("longsword"),
            participation("rapier"),
            participation("dagger"),
          ],
        })}
        nominationTitleById={nominationTitleById}
        onOpenCard={vi.fn()}
      />,
    );

    expect(screen.getByText("Сабля")).toBeInTheDocument();
    expect(screen.getByText("Длинный меч")).toBeInTheDocument();
    expect(screen.getByText("Рапира")).toBeInTheDocument();
    expect(screen.queryByText("Кинжал")).not.toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("mutes and strikes through the name for a withdrawn fighter, showing the reason (FR-3/FR-4)", () => {
    render(
      <FighterRow
        fighter={fighter({
          status: "FIGHTER_STATUS_WITHDRAWN",
          withdrawalReason: "WITHDRAWAL_REASON_INJURY",
        })}
        nominationTitleById={nominationTitleById}
        onOpenCard={vi.fn()}
      />,
    );

    expect(screen.getByText("Иван Петров")).toHaveClass("line-through");
    expect(screen.getByText("Выбыл")).toBeInTheDocument();
    expect(screen.getByText("травма")).toBeInTheDocument();
  });

  it("shows origin and the roster appearance date (FR-5)", () => {
    render(
      <FighterRow
        fighter={fighter({ fromApplication: false, createdAt: "2026-02-10T00:00:00.000Z" })}
        nominationTitleById={nominationTitleById}
        onOpenCard={vi.fn()}
      />,
    );

    expect(screen.getByText("заведён вручную")).toBeInTheDocument();
  });

  it("shows a linked-account badge when the fighter has linkedAccountId (spec 0040, FR-8/AC-6)", () => {
    render(
      <FighterRow
        fighter={fighter({ linkedAccountId: "user-1" })}
        nominationTitleById={nominationTitleById}
        onOpenCard={vi.fn()}
      />,
    );

    expect(screen.getByText("учётка")).toBeInTheDocument();
  });

  it("does not show a linked-account badge when linkedAccountId is empty", () => {
    render(
      <FighterRow fighter={fighter({})} nominationTitleById={nominationTitleById} onOpenCard={vi.fn()} />,
    );

    expect(screen.queryByText("учётка")).not.toBeInTheDocument();
  });

  it("clicking the row opens the card (AC-7)", () => {
    const onOpenCard = vi.fn();
    render(
      <FighterRow fighter={fighter({})} nominationTitleById={nominationTitleById} onOpenCard={onOpenCard} />,
    );

    fireEvent.click(screen.getByText("Иван Петров"));
    expect(onOpenCard).toHaveBeenCalledWith("f1");
  });

  it("clicking the '+N' expand button does NOT open the card (AC-7/NFR-5)", () => {
    const onOpenCard = vi.fn();
    render(
      <FighterRow
        fighter={fighter({
          participations: [
            participation("sabre"),
            participation("longsword"),
            participation("rapier"),
            participation("dagger"),
          ],
        })}
        nominationTitleById={nominationTitleById}
        onOpenCard={onOpenCard}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+1" }));

    expect(onOpenCard).not.toHaveBeenCalled();
  });
});
