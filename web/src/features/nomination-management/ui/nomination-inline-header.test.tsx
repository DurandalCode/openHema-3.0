// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Nomination } from "@/entities/nomination/lib/types";
import { NominationInlineHeader } from "./nomination-inline-header";

afterEach(() => {
  cleanup();
});

function nomination(overrides: Partial<Nomination>): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Длинный меч",
    description: "Основной клинковый разряд",
    fighterCapacity: null,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

type MutateOpts<T = unknown> = { onSuccess?: (r?: T) => void; onError?: (e: Error) => void };

const updateMutate = vi.fn((_vars: unknown, opts?: MutateOpts) => opts?.onSuccess?.());
let updatePending = false;
vi.mock("../api/use-update-nomination", () => ({
  useUpdateNomination: () => ({ mutate: updateMutate, isPending: updatePending }),
}));

let closeResult: { ok: true } | { ok: false; error: string } = { ok: true };
const closeMutate = vi.fn((_id: string, opts?: MutateOpts) => {
  if (closeResult.ok) opts?.onSuccess?.();
  else opts?.onError?.(new Error(closeResult.error));
});
let closePending = false;
vi.mock("../api/use-close-registration", () => ({
  useCloseRegistration: () => ({ mutate: closeMutate, isPending: closePending }),
}));

let reopenResult: { ok: true } | { ok: false; error: string } = { ok: true };
const reopenMutate = vi.fn((_id: string, opts?: MutateOpts) => {
  if (reopenResult.ok) opts?.onSuccess?.();
  else opts?.onError?.(new Error(reopenResult.error));
});
let reopenPending = false;
vi.mock("../api/use-reopen-registration", () => ({
  useReopenRegistration: () => ({ mutate: reopenMutate, isPending: reopenPending }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  updatePending = false;
  closePending = false;
  reopenPending = false;
  closeResult = { ok: true };
  reopenResult = { ok: true };
});

describe("NominationInlineHeader", () => {
  it("saves the title on Enter and shows a success toast (AC-1)", () => {
    render(<NominationInlineHeader tournamentId="t1" nomination={nomination({})} />);

    fireEvent.click(screen.getByRole("button", { name: "Название" }));
    const input = screen.getByLabelText("Название");
    fireEvent.change(input, { target: { value: "Длинный меч · муж" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: "n1",
        input: {
          title: "Длинный меч · муж",
          description: "Основной клинковый разряд",
          fighterCapacity: null,
          metadata: { rulesUrl: "" },
        },
      },
      expect.anything(),
    );
    expect(toastSuccess).toHaveBeenCalledWith("Название сохранено");
    // Возвращается в режим отображения.
    expect(screen.getByRole("button", { name: "Название" })).toBeInTheDocument();
  });

  it("saves the title on blur too (AC-1)", () => {
    render(<NominationInlineHeader tournamentId="t1" nomination={nomination({})} />);

    fireEvent.click(screen.getByRole("button", { name: "Название" }));
    const input = screen.getByLabelText("Название");
    fireEvent.change(input, { target: { value: "Новое имя" } });
    fireEvent.blur(input);

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ title: "Новое имя" }) }),
      expect.anything(),
    );
  });

  it("Esc cancels the edit and reverts to the last saved value without a request", () => {
    render(<NominationInlineHeader tournamentId="t1" nomination={nomination({})} />);

    fireEvent.click(screen.getByRole("button", { name: "Название" }));
    const input = screen.getByLabelText("Название");
    fireEvent.change(input, { target: { value: "Черновик, который не сохранится" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(updateMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Название" })).toHaveTextContent("Длинный меч");
  });

  it("shows an inline error and does not send a request when the title is cleared (FR-3)", () => {
    render(<NominationInlineHeader tournamentId="t1" nomination={nomination({})} />);

    fireEvent.click(screen.getByRole("button", { name: "Название" }));
    const input = screen.getByLabelText("Название");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Введите название")).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
    // Значение вернулось к сохранённому.
    expect(screen.getByLabelText("Название")).toHaveValue("Длинный меч");
  });

  it("edits fighter capacity, blank means 'not set' (AC-2)", () => {
    render(
      <NominationInlineHeader
        tournamentId="t1"
        nomination={nomination({ fighterCapacity: null })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Кол-во бойцов" }));
    const input = screen.getByLabelText("Кол-во бойцов");
    fireEvent.change(input, { target: { value: "32" } });
    fireEvent.blur(input);

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ fighterCapacity: 32 }) }),
      expect.anything(),
    );
    expect(toastSuccess).toHaveBeenCalledWith("Вместимость сохранена");
  });

  it("clearing the capacity field saves null (not set)", () => {
    render(
      <NominationInlineHeader
        tournamentId="t1"
        nomination={nomination({ fighterCapacity: 32 })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Кол-во бойцов" }));
    const input = screen.getByLabelText("Кол-во бойцов");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ fighterCapacity: null }) }),
      expect.anything(),
    );
  });

  it("edits the rules URL (AC-2)", () => {
    render(<NominationInlineHeader tournamentId="t1" nomination={nomination({})} />);

    fireEvent.click(screen.getByRole("button", { name: "Ссылка на регламент" }));
    const input = screen.getByLabelText("Ссылка на регламент");
    fireEvent.change(input, { target: { value: "https://example.com/rules" } });
    fireEvent.blur(input);

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ metadata: { rulesUrl: "https://example.com/rules" } }),
      }),
      expect.anything(),
    );
    expect(toastSuccess).toHaveBeenCalledWith("Ссылка на регламент сохранена");
  });

  it("does not overwrite the nomination's description when saving a single field (plan.md risk)", () => {
    render(
      <NominationInlineHeader
        tournamentId="t1"
        nomination={nomination({ description: "Не должно потеряться" })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Кол-во бойцов" }));
    fireEvent.change(screen.getByLabelText("Кол-во бойцов"), { target: { value: "16" } });
    fireEvent.blur(screen.getByLabelText("Кол-во бойцов"));

    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ description: "Не должно потеряться" }),
      }),
      expect.anything(),
    );
  });

  it("shows a toast error when saving a field fails", () => {
    updateMutate.mockImplementationOnce((_vars: unknown, opts?: MutateOpts) =>
      opts?.onError?.(new Error("title is required")),
    );
    render(<NominationInlineHeader tournamentId="t1" nomination={nomination({})} />);

    fireEvent.click(screen.getByRole("button", { name: "Название" }));
    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Х" } });
    fireEvent.keyDown(screen.getByLabelText("Название"), { key: "Enter" });

    expect(toastError).toHaveBeenCalledWith("title is required");
  });

  it("shows 'Закрыть приём' for an open nomination and closes it on click (AC-3)", () => {
    render(
      <NominationInlineHeader
        tournamentId="t1"
        nomination={nomination({ status: "NOMINATION_STATUS_OPEN" })}
      />,
    );

    const button = screen.getByRole("button", { name: "Закрыть приём" });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(closeMutate).toHaveBeenCalledWith("n1", expect.anything());
    expect(toastSuccess).toHaveBeenCalledWith("Приём заявок закрыт");
  });

  it("shows 'Открыть приём' for a closed nomination and reopens it on click (AC-3)", () => {
    render(
      <NominationInlineHeader
        tournamentId="t1"
        nomination={nomination({ status: "NOMINATION_STATUS_CLOSED" })}
      />,
    );

    const button = screen.getByRole("button", { name: "Открыть приём" });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(reopenMutate).toHaveBeenCalledWith("n1", expect.anything());
    expect(toastSuccess).toHaveBeenCalledWith("Приём заявок открыт");
  });

  it("disables the registration button with an explanation once bouts have started (AC-3)", () => {
    render(
      <NominationInlineHeader
        tournamentId="t1"
        nomination={nomination({ status: "NOMINATION_STATUS_ACTIVE" })}
      />,
    );

    const button = screen.getByRole("button", { name: "Бои уже начались — открыть приём нельзя" });
    expect(button).toBeDisabled();
  });

  it("shows a Russian toast error when the server rejects a 409 reopen (AC-3)", () => {
    reopenResult = { ok: false, error: "cannot reopen registration" };
    render(
      <NominationInlineHeader
        tournamentId="t1"
        nomination={nomination({ status: "NOMINATION_STATUS_CLOSED" })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Открыть приём" }));

    expect(toastError).toHaveBeenCalledWith("cannot reopen registration");
  });
});
