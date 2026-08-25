// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Fighter } from "@/entities/fighter/lib/types";
import { MergeFightersDialog } from "./merge-fighters-dialog";

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

const mergeMutate = vi.fn();
vi.mock("../api/use-fighter-mutations", () => ({
  useMergeFighters: () => ({ mutate: mergeMutate, isPending: false }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

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

const fighters = [
  fighter({ id: "f1", name: "Иван Петров" }),
  fighter({ id: "f2", name: "Иван П." }),
  fighter({ id: "f3", name: "Слитый дубль", status: "FIGHTER_STATUS_MERGED", mergedIntoId: "f2" }),
];

describe("MergeFightersDialog", () => {
  it("keeps the merge button disabled until distinct source and target are chosen (FR-10)", () => {
    render(<MergeFightersDialog fighters={fighters} open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Слить" })).toBeDisabled();
  });

  it("excludes already-merged fighters from selection (FR-10: merged record is no longer a separate participant)", () => {
    render(<MergeFightersDialog fighters={fighters} open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("combobox", { name: /дубль/i }));
    expect(screen.queryByText("Слитый дубль")).not.toBeInTheDocument();
  });

  it("requires confirmation before calling the merge mutation (irreversible action canon, 0028/0038)", () => {
    render(<MergeFightersDialog fighters={fighters} open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("combobox", { name: /дубль/i }));
    fireEvent.click(screen.getByRole("option", { name: /Иван Петров/ }));
    fireEvent.click(screen.getByRole("combobox", { name: /итоговая запись/i }));
    fireEvent.click(screen.getByRole("option", { name: /^Иван П\./ }));

    fireEvent.click(screen.getByRole("button", { name: "Слить" }));

    expect(mergeMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/необратимо/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Да, слить" }));

    expect(mergeMutate).toHaveBeenCalledWith(
      { sourceFighterId: "f1", targetFighterId: "f2" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("shows a success toast and closes on successful merge", () => {
    mergeMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    const onOpenChange = vi.fn();
    render(<MergeFightersDialog fighters={fighters} open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("combobox", { name: /дубль/i }));
    fireEvent.click(screen.getByRole("option", { name: /Иван Петров/ }));
    fireEvent.click(screen.getByRole("combobox", { name: /итоговая запись/i }));
    fireEvent.click(screen.getByRole("option", { name: /^Иван П\./ }));
    fireEvent.click(screen.getByRole("button", { name: "Слить" }));
    fireEvent.click(screen.getByRole("button", { name: "Да, слить" }));

    expect(toastSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an error toast on merge failure", () => {
    mergeMutate.mockImplementation((_vars, opts) => opts?.onError?.(new Error("уже объединён")));
    render(<MergeFightersDialog fighters={fighters} open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("combobox", { name: /дубль/i }));
    fireEvent.click(screen.getByRole("option", { name: /Иван Петров/ }));
    fireEvent.click(screen.getByRole("combobox", { name: /итоговая запись/i }));
    fireEvent.click(screen.getByRole("option", { name: /^Иван П\./ }));
    fireEvent.click(screen.getByRole("button", { name: "Слить" }));
    fireEvent.click(screen.getByRole("button", { name: "Да, слить" }));

    expect(toastError).toHaveBeenCalledWith("уже объединён");
  });
});
