// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { NominationSchema } from "../api/use-nomination-schemas";
import { NominationsScreen } from "./nominations-screen";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

function nomination(overrides: Partial<Nomination>): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Номинация 1",
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

let nominationsState: { data: Nomination[]; isLoading: boolean; error: Error | null } = {
  data: [],
  isLoading: false,
  error: null,
};
const nominationsRefetch = vi.fn();

vi.mock("../api/use-nominations", () => ({
  useNominations: () => ({ ...nominationsState, refetch: nominationsRefetch }),
}));

let schemasResult = new Map<string, NominationSchema>();
vi.mock("../api/use-nomination-schemas", () => ({
  useNominationSchemas: () => schemasResult,
}));

type MutateOpts<T = unknown> = { onSuccess?: (r?: T) => void; onError?: (e: Error) => void };

const reorderMutate = vi.fn();
vi.mock("../api/use-reorder-nominations", () => ({
  useReorderNominations: () => ({ mutate: reorderMutate, isPending: false }),
}));

let deleteResult: { ok: true } | { ok: false; error: string } = { ok: true };
const deleteMutate = vi.fn((_id: string, opts?: MutateOpts) => {
  if (deleteResult.ok) opts?.onSuccess?.();
  else opts?.onError?.(new Error(deleteResult.error));
});
vi.mock("../api/use-delete-nomination", () => ({
  useDeleteNomination: () => ({ mutate: deleteMutate, isPending: false }),
}));

const closeMutate = vi.fn((_id: string, opts?: MutateOpts) => opts?.onSuccess?.());
vi.mock("../api/use-close-registration", () => ({
  useCloseRegistration: () => ({ mutate: closeMutate, isPending: false, variables: undefined }),
}));

let reopenResult: { ok: true } | { ok: false; error: string } = { ok: true };
const reopenMutate = vi.fn((_id: string, opts?: MutateOpts) => {
  if (reopenResult.ok) opts?.onSuccess?.();
  else opts?.onError?.(new Error(reopenResult.error));
});
vi.mock("../api/use-reopen-registration", () => ({
  useReopenRegistration: () => ({ mutate: reopenMutate, isPending: false, variables: undefined }),
}));

vi.mock("../api/use-create-nomination", () => ({
  useCreateNomination: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastUndo = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
  toastUndo: (...args: unknown[]) => toastUndo(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  nominationsState = { data: [], isLoading: false, error: null };
  schemasResult = new Map();
  deleteResult = { ok: true };
  reopenResult = { ok: true };
});

describe("NominationsScreen", () => {
  it("fills the section header: crumb with tournament name, title, and open-registration count (AC-6)", () => {
    nominationsState = {
      data: [
        nomination({ id: "n1", status: "NOMINATION_STATUS_OPEN" }),
        nomination({ id: "n2", status: "NOMINATION_STATUS_OPEN" }),
        nomination({ id: "n3", status: "NOMINATION_STATUS_CLOSED" }),
        nomination({ id: "n4", status: "NOMINATION_STATUS_ACTIVE" }),
        nomination({ id: "n5", status: "NOMINATION_STATUS_FINISHED" }),
      ],
      isLoading: false,
      error: null,
    };

    render(<NominationsScreen tournamentId="t1" tournamentName="Клинок Севера 2026" />);

    const header = document.querySelector('[data-slot="page-header"]') as HTMLElement;
    expect(within(header).getByText("НОМИНАЦИИ · КЛИНОК СЕВЕРА 2026")).toBeInTheDocument();
    expect(within(header).getByText("Номинации")).toBeInTheDocument();
    expect(within(header).getByText("5 номинаций · 2 с открытым приёмом")).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: /Номинация/ })).toBeInTheDocument();
  });

  it("shows only 'НОМИНАЦИИ' in the crumb without an active tournament", () => {
    render(<NominationsScreen tournamentId="t1" />);
    expect(screen.getByText("НОМИНАЦИИ")).toBeInTheDocument();
  });

  it("shows the order-meaning caption and the table (AC-1)", () => {
    nominationsState = { data: [nomination({})], isLoading: false, error: null };
    render(<NominationsScreen tournamentId="t1" />);

    expect(
      screen.getByText("Порядок номинаций определяет их место во всех списках турнира"),
    ).toBeInTheDocument();
    expect(screen.getByText("Номинация 1")).toBeInTheDocument();
  });

  it("swaps only the two neighboring nominations on reorder (AC-13)", () => {
    nominationsState = {
      data: [
        nomination({ id: "n1", title: "Первая", position: 0 }),
        nomination({ id: "n2", title: "Вторая", position: 1 }),
        nomination({ id: "n3", title: "Третья", position: 2 }),
      ],
      isLoading: false,
      error: null,
    };

    render(<NominationsScreen tournamentId="t1" />);

    const upButtons = screen.getAllByRole("button", { name: "Переместить выше" });
    fireEvent.click(upButtons[2]);

    expect(reorderMutate).toHaveBeenCalledWith(["n1", "n3", "n2"]);
  });

  it("closing registration shows an undo toast that reopens it on click (AC-9)", () => {
    nominationsState = { data: [nomination({ id: "n1", status: "NOMINATION_STATUS_OPEN" })], isLoading: false, error: null };
    render(<NominationsScreen tournamentId="t1" />);

    const trigger = screen.getByRole("button", { name: "Действия" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Закрыть приём" }));

    expect(closeMutate).toHaveBeenCalledWith("n1", expect.anything());
    expect(toastUndo).toHaveBeenCalledTimes(1);
    const [, options] = toastUndo.mock.calls[0] as [string, { onUndo: () => void }];
    options.onUndo();
    expect(reopenMutate).toHaveBeenCalledWith("n1", expect.anything());
  });

  it("shows a no-retry error toast when reopening registration is rejected (AC-11)", () => {
    const expectedMessage =
      "Открыть приём нельзя: приём закрылся автоматически при посеве либо в номинации уже есть распределённые бойцы — сначала расформируйте состав этапа";
    reopenResult = { ok: false, error: expectedMessage };
    nominationsState = { data: [nomination({ id: "n1", status: "NOMINATION_STATUS_CLOSED" })], isLoading: false, error: null };
    render(<NominationsScreen tournamentId="t1" />);

    const trigger = screen.getByRole("button", { name: "Действия" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Открыть приём" }));

    expect(toastError).toHaveBeenCalledTimes(1);
    const [message, options] = toastError.mock.calls[0] as [string, { retry?: () => void } | undefined];
    expect(message).toBe(expectedMessage);
    expect(options?.retry).toBeUndefined();
  });

  it("deletes through a confirm dialog requiring the exact title, without an undo toast (AC-12)", () => {
    nominationsState = { data: [nomination({ id: "n1", title: "Длинный меч · муж" })], isLoading: false, error: null };
    render(<NominationsScreen tournamentId="t1" />);

    const trigger = screen.getByRole("button", { name: "Действия" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Удалить" }));

    const confirmButton = screen.getByRole("button", { name: "Удалить" });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Введите «Длинный меч · муж»/), {
      target: { value: "Длинный меч · муж" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    expect(deleteMutate).toHaveBeenCalledWith("n1", expect.anything());
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastUndo).not.toHaveBeenCalled();
  });

  it("shows loading skeleton and a retryable load error", () => {
    nominationsState = { data: [], isLoading: true, error: null };
    const { unmount } = render(<NominationsScreen tournamentId="t1" />);
    expect(document.querySelectorAll('[data-slot="skeleton-row"]').length).toBeGreaterThan(0);
    unmount();

    nominationsState = { data: [], isLoading: false, error: new Error("Сеть недоступна") };
    render(<NominationsScreen tournamentId="t1" />);
    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(nominationsRefetch).toHaveBeenCalledTimes(1);
  });
});
