// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateNominationDialog } from "./create-nomination-dialog";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

afterEach(() => {
  cleanup();
});

const createdNomination = {
  id: "n1",
  title: "Сабля · открытая",
  description: "",
  fighterCapacity: null,
  metadata: { rulesUrl: "" },
};

const createMutate = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: (n: typeof createdNomination) => void }) => {
    if (!createError) opts?.onSuccess?.(createdNomination);
  },
);
let createError: Error | null = null;
const createReset = vi.fn();

vi.mock("../api/use-create-nomination", () => ({
  useCreateNomination: () => ({
    mutate: createMutate,
    isPending: false,
    error: createError,
    reset: createReset,
  }),
}));

describe("CreateNominationDialog", () => {
  beforeEach(() => {
    createError = null;
    vi.clearAllMocks();
  });

  it("shows an inline error for an empty title and does not submit or close (AC-7)", () => {
    const onOpenChange = vi.fn();
    render(<CreateNominationDialog tournamentId="t1" open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Добавить номинацию" }));

    expect(screen.getByText("Введите название")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("submits all fields, closes and notifies the parent on success (AC-7)", () => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    render(
      <CreateNominationDialog
        tournamentId="t1"
        open
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Сабля · открытая" } });
    fireEvent.change(screen.getByLabelText("Описание"), { target: { value: "Открытый разряд" } });
    fireEvent.change(screen.getByLabelText("Кол-во бойцов"), { target: { value: "24" } });
    fireEvent.change(screen.getByLabelText("Ссылка на регламент"), {
      target: { value: "https://example.com/rules" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Добавить номинацию" }));

    expect(createMutate).toHaveBeenCalledWith(
      {
        title: "Сабля · открытая",
        description: "Открытый разряд",
        fighterCapacity: 24,
        metadata: { rulesUrl: "https://example.com/rules" },
      },
      expect.anything(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreated).toHaveBeenCalledWith(createdNomination);
  });

  it("treats an empty capacity as 'not set' (null), not zero", () => {
    render(<CreateNominationDialog tournamentId="t1" open onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Меч и баклер" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить номинацию" }));

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ fighterCapacity: null }),
      expect.anything(),
    );
  });

  it("a server error keeps the dialog open with entered values still filled in", () => {
    createError = new Error("title is required");
    const onOpenChange = vi.fn();
    render(<CreateNominationDialog tournamentId="t1" open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Сабля · открытая" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить номинацию" }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("title is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Название")).toHaveValue("Сабля · открытая");
  });
});
