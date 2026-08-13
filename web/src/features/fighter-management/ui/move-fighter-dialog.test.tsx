// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Fighter } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { MoveFighterDialog } from "./move-fighter-dialog";

const mutateMock = vi.fn();
let mutationState = { isPending: false };

vi.mock("../api/use-fighter-mutations", () => ({
  useMoveFighter: () => ({ mutate: mutateMock, isPending: mutationState.isPending }),
}));

vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mutationState = { isPending: false };
});

function fighter(overrides: Partial<Fighter>): Fighter {
  return {
    id: "f1",
    tournamentId: "t1",
    name: "Иван Петров",
    club: "Клинок Севера",
    status: "FIGHTER_STATUS_ACTIVE",
    withdrawalReason: "WITHDRAWAL_REASON_UNSPECIFIED",
    participations: [{ nominationId: "sabre", status: "PARTICIPATION_STATUS_ACTIVE" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fromApplication: true,
    ...overrides,
  };
}

function nomination(overrides: Partial<Nomination>): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Лонгсворд",
    description: "",
    fighterCapacity: null,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("MoveFighterDialog", () => {
  it("offers only nominations without an active participation as targets (FR-15/AC-9)", () => {
    const nominations = [
      nomination({ id: "sabre", title: "Сабля" }),
      nomination({ id: "longsword", title: "Длинный меч" }),
    ];

    render(
      <MoveFighterDialog
        fighter={fighter({})}
        fromNominationId="sabre"
        nominations={nominations}
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("Длинный меч")).toBeInTheDocument();
    expect(screen.queryByText("Сабля")).not.toBeInTheDocument();
  });

  it("calls useMoveFighter exactly once with fromNominationId and the chosen target (AC-8)", () => {
    const nominations = [
      nomination({ id: "sabre", title: "Сабля" }),
      nomination({ id: "longsword", title: "Длинный меч" }),
    ];
    const onOpenChange = vi.fn();

    render(
      <MoveFighterDialog
        fighter={fighter({})}
        fromNominationId="sabre"
        nominations={nominations}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Длинный меч"));
    fireEvent.click(screen.getByRole("button", { name: "Перевести" }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock).toHaveBeenCalledWith(
      { fighterId: "f1", fromNominationId: "sabre", toNominationId: "longsword" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("disables the confirm button until a target nomination is chosen", () => {
    const nominations = [nomination({ id: "longsword", title: "Длинный меч" })];

    render(
      <MoveFighterDialog
        fighter={fighter({})}
        fromNominationId="sabre"
        nominations={nominations}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Перевести" })).toBeDisabled();
  });
});
