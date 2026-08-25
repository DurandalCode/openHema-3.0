// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Fighter } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { FighterCardDialog } from "./fighter-card-dialog";

const mutateEdit = vi.fn();
const mutateWithdraw = vi.fn();
const mutateReturn = vi.fn();
const mutateAdd = vi.fn();
const mutateRemove = vi.fn();

vi.mock("../api/use-fighter-mutations", () => ({
  useEditFighter: () => ({ mutate: mutateEdit, isPending: false }),
  useWithdrawFighter: () => ({ mutate: mutateWithdraw, isPending: false }),
  useReturnFighter: () => ({ mutate: mutateReturn, isPending: false }),
  useAddToNomination: () => ({ mutate: mutateAdd, isPending: false }),
  useRemoveFromNomination: () => ({ mutate: mutateRemove, isPending: false }),
}));

const resolveReturnSeeding = vi.fn();
vi.mock("../api/return-outcome", () => ({
  resolveReturnSeeding: (...args: unknown[]) => resolveReturnSeeding(...args),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
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
});

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

const nominations = [
  nomination({ id: "sabre", title: "Сабля" }),
  nomination({ id: "longsword", title: "Длинный меч" }),
];

describe("FighterCardDialog", () => {
  it("shows name, club, origin, status and full participations list (AC-6)", () => {
    const f = fighter({
      participations: [
        { nominationId: "sabre", status: "PARTICIPATION_STATUS_ACTIVE" },
        { nominationId: "longsword", status: "PARTICIPATION_STATUS_REMOVED" },
      ],
    });

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("Иван Петров")).toBeInTheDocument();
    expect(screen.getByText(/Клинок Севера/)).toBeInTheDocument();
    expect(screen.getByText("из заявки")).toBeInTheDocument();
    expect(screen.getByText("Активен")).toBeInTheDocument();
    expect(screen.getByText("Сабля")).toBeInTheDocument();
    expect(screen.getByText("Длинный меч")).toBeInTheDocument();
  });

  it("shows a linked-account badge with the display name when the fighter has a linked account (spec 0040, FR-8/AC-6)", () => {
    const f = fighter({ linkedAccountId: "u1", linkedAccountDisplayName: "Ivan Petrov" });

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("Учётка: Ivan Petrov")).toBeInTheDocument();
  });

  it("does not show a linked-account badge when there is no linked account", () => {
    const f = fighter({});

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    expect(screen.queryByText(/Учётка/)).not.toBeInTheDocument();
  });

  it("shows Снять/Перевести for an active participation and Вернуть for a removed one (AC-6)", () => {
    const f = fighter({
      participations: [
        { nominationId: "sabre", status: "PARTICIPATION_STATUS_ACTIVE" },
        { nominationId: "longsword", status: "PARTICIPATION_STATUS_REMOVED" },
      ],
    });

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: /Снять/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Перевести/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Вернуть/ })).toBeInTheDocument();
  });

  it("editing name/club shows an inline error for an empty name, does not save (FR-13)", () => {
    render(
      <FighterCardDialog fighterId="f1" fighters={[fighter({})]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Править/ }));
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(screen.getByText("Введите имя")).toBeInTheDocument();
    expect(mutateEdit).not.toHaveBeenCalled();
  });

  it("saves a valid name/club edit (AC-14)", () => {
    render(
      <FighterCardDialog fighterId="f1" fighters={[fighter({})]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Править/ }));
    fireEvent.change(screen.getByLabelText("Клуб"), { target: { value: "Новый клуб" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(mutateEdit).toHaveBeenCalledWith(
      { fighterId: "f1", name: "Иван Петров", club: "Новый клуб" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("shows a confirmation with consequences before withdrawing, no undo action on success toast (AC-10/FR-18/FR-19)", () => {
    mutateWithdraw.mockImplementation((_args, opts) => opts?.onSuccess?.());
    const f = fighter({ status: "FIGHTER_STATUS_ACTIVE" });

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: /причина/i }));
    fireEvent.click(screen.getByText("Травма"));
    fireEvent.click(screen.getByRole("button", { name: "Вывести с турнира" }));

    expect(screen.getByText(/нераспределённых/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Да, вывести с турнира" }));

    expect(mutateWithdraw).toHaveBeenCalledWith(
      { fighterId: "f1", reason: "WITHDRAWAL_REASON_INJURY" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(toastSuccess).toHaveBeenCalled();
    const toastCall = toastSuccess.mock.calls[0];
    // toastSuccess не принимает опцию отмены вовсе (сигнатура shared/lib/toast) — если бы код
    // где-то использовал toastUndo для этого действия, второй аргумент здесь бы не появился.
    expect(toastCall.length).toBe(1);
  });

  it("returns the fighter to the tournament without any confirmation (AC-11)", () => {
    const f = fighter({ status: "FIGHTER_STATUS_WITHDRAWN", withdrawalReason: "WITHDRAWAL_REASON_INJURY" });

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Вернуть на турнир" }));

    expect(screen.queryByRole("dialog", { name: /Вернуть/ })).not.toBeInTheDocument();
    expect(mutateReturn).toHaveBeenCalledWith(
      "f1",
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("shows 'возвращён в пул N' when the fighter lands back in a pool (spec 0040, FR-6/AC-4)", async () => {
    mutateReturn.mockImplementation((_id, opts) => opts?.onSuccess?.());
    resolveReturnSeeding.mockResolvedValue({ restored: true, poolNumber: 2 });
    const f = fighter({
      status: "FIGHTER_STATUS_WITHDRAWN",
      participations: [{ nominationId: "sabre", status: "PARTICIPATION_STATUS_ACTIVE" }],
    });

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Вернуть на турнир" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Иван Петров возвращён в пул 2"));
    expect(resolveReturnSeeding).toHaveBeenCalledWith("f1", ["sabre"]);
  });

  it("shows 'посев не восстановлен' when the fighter ends up unassigned (spec 0040, FR-6/AC-5)", async () => {
    mutateReturn.mockImplementation((_id, opts) => opts?.onSuccess?.());
    resolveReturnSeeding.mockResolvedValue({ restored: false });
    const f = fighter({ status: "FIGHTER_STATUS_WITHDRAWN" });

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Вернуть на турнир" }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "Иван Петров возвращён, посев не восстановлен — распределите вручную",
      ),
    );
  });

  it("shows a plain 'возвращён на турнир' toast when there was nothing to restore (spec 0040)", async () => {
    mutateReturn.mockImplementation((_id, opts) => opts?.onSuccess?.());
    resolveReturnSeeding.mockResolvedValue(null);
    const f = fighter({ status: "FIGHTER_STATUS_WITHDRAWN" });

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Вернуть на турнир" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Иван Петров возвращён на турнир"));
  });

  it("shows a server error toast without a retry action on mutation failure (AC-12)", () => {
    mutateReturn.mockImplementation((_id, opts) => opts?.onError?.(new Error("нельзя вернуть")));
    const f = fighter({ status: "FIGHTER_STATUS_WITHDRAWN" });

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Вернуть на турнир" }));

    expect(toastError).toHaveBeenCalledWith("нельзя вернуть");
    const errorCall = toastError.mock.calls[0];
    expect(errorCall.length).toBe(1); // без опции retry
  });

  it("stays open after a successful action (FR-16)", () => {
    mutateReturn.mockImplementation((_id, opts) => opts?.onSuccess?.());
    const onOpenChange = vi.fn();
    const f = fighter({ status: "FIGHTER_STATUS_WITHDRAWN" });

    render(
      <FighterCardDialog fighterId="f1" fighters={[f]} nominations={nominations} open onOpenChange={onOpenChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Вернуть на турнир" }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("closes the card when the fighter disappears from the roster data (plan «Риски»)", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <FighterCardDialog
        fighterId="f1"
        fighters={[fighter({})]}
        nominations={nominations}
        open
        onOpenChange={onOpenChange}
      />,
    );

    rerender(
      <FighterCardDialog fighterId="f1" fighters={[]} nominations={nominations} open onOpenChange={onOpenChange} />,
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
