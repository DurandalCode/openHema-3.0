// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Nomination } from "@/entities/nomination/lib/types";
import { EditNominationDialog } from "./edit-nomination-dialog";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

afterEach(() => {
  cleanup();
});

function nomination(overrides: Partial<Nomination>): Nomination {
  return {
    id: "n1",
    tournamentId: "t1",
    title: "Длинный меч · муж",
    description: "Основной клинковый разряд",
    fighterCapacity: 32,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const updateMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => {
  if (!updateError) opts?.onSuccess?.();
});
let updateError: Error | null = null;
const updateReset = vi.fn();

vi.mock("../api/use-update-nomination", () => ({
  useUpdateNomination: () => ({
    mutate: updateMutate,
    isPending: false,
    error: updateError,
    reset: updateReset,
  }),
}));

describe("EditNominationDialog", () => {
  beforeEach(() => {
    updateError = null;
    vi.clearAllMocks();
  });

  it("pre-fills fields from the nomination, including 'not set' capacity as empty (AC-8)", () => {
    render(
      <EditNominationDialog
        tournamentId="t1"
        nomination={nomination({ fighterCapacity: null })}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Название")).toHaveValue("Длинный меч · муж");
    expect(screen.getByLabelText("Описание")).toHaveValue("Основной клинковый разряд");
    expect(screen.getByLabelText("Кол-во бойцов")).toHaveValue(null);
  });

  it("submits edited description and capacity, closes on success (AC-8)", () => {
    const onOpenChange = vi.fn();
    render(
      <EditNominationDialog
        tournamentId="t1"
        nomination={nomination({})}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Описание"), { target: { value: "Обновлено" } });
    fireEvent.change(screen.getByLabelText("Кол-во бойцов"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: "n1",
        input: {
          title: "Длинный меч · муж",
          description: "Обновлено",
          fighterCapacity: 40,
          metadata: { rulesUrl: "" },
        },
      },
      expect.anything(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an inline error and does not submit when the title is cleared", () => {
    render(
      <EditNominationDialog
        tournamentId="t1"
        nomination={nomination({})}
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(screen.getByText("Введите название")).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("a server error keeps the dialog open", () => {
    updateError = new Error("title is required");
    const onOpenChange = vi.fn();
    render(
      <EditNominationDialog
        tournamentId="t1"
        nomination={nomination({})}
        open
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("title is required")).toBeInTheDocument();
  });
});
