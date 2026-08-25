// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fighter } from "@/entities/fighter/lib/types";
import { FindFighterByAccountDialog } from "./find-fighter-by-account-dialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const findFighterByAccountRequest = vi.fn();
vi.mock("../api/requests", () => ({
  findFighterByAccountRequest: (...args: unknown[]) => findFighterByAccountRequest(...args),
}));

const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastError: (...args: unknown[]) => toastError(...args),
}));

function foundFighter(overrides: Partial<Fighter> = {}): Fighter {
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
    linkedAccountId: "u1",
    linkedAccountDisplayName: "",
    mergedIntoId: "",
    ...overrides,
  };
}

describe("FindFighterByAccountDialog", () => {
  it("does not submit an empty userId", () => {
    render(
      <FindFighterByAccountDialog tournamentId="t1" open onOpenChange={vi.fn()} onOpenFighter={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Найти" })).toBeDisabled();
    expect(findFighterByAccountRequest).not.toHaveBeenCalled();
  });

  it("searches by userId and shows the found fighter (spec 0040, FR-9/AC-7)", async () => {
    findFighterByAccountRequest.mockResolvedValue({ ok: true, fighter: foundFighter() });

    render(
      <FindFighterByAccountDialog tournamentId="t1" open onOpenChange={vi.fn()} onOpenFighter={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("Id учётки"), { target: { value: "u1" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => expect(screen.getByText(/Иван Петров/)).toBeInTheDocument());
    expect(findFighterByAccountRequest).toHaveBeenCalledWith("u1", "t1");
  });

  it("opens the found fighter's card and closes the dialog", async () => {
    findFighterByAccountRequest.mockResolvedValue({ ok: true, fighter: foundFighter() });
    const onOpenFighter = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <FindFighterByAccountDialog
        tournamentId="t1"
        open
        onOpenChange={onOpenChange}
        onOpenFighter={onOpenFighter}
      />,
    );

    fireEvent.change(screen.getByLabelText("Id учётки"), { target: { value: "u1" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(screen.getByText(/Иван Петров/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Открыть карточку" }));

    expect(onOpenFighter).toHaveBeenCalledWith("f1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a not-found message when the account has no fighter in this tournament (FR-9)", async () => {
    findFighterByAccountRequest.mockResolvedValue({ ok: true, fighter: null });

    render(
      <FindFighterByAccountDialog tournamentId="t1" open onOpenChange={vi.fn()} onOpenFighter={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("Id учётки"), { target: { value: "u2" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() =>
      expect(screen.getByText("У этой учётки нет бойца в этом турнире.")).toBeInTheDocument(),
    );
  });

  it("shows a toast on request failure", async () => {
    findFighterByAccountRequest.mockResolvedValue({ ok: false, error: "boom" });

    render(
      <FindFighterByAccountDialog tournamentId="t1" open onOpenChange={vi.fn()} onOpenFighter={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("Id учётки"), { target: { value: "u1" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("boom"));
  });
});
