// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateArenaDialog } from "./create-arena-dialog";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

afterEach(() => {
  cleanup();
});

const createdArena = { id: "a1", name: "Арена 5", description: "" };

const createMutate = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: (a: typeof createdArena) => void }) => {
    if (!createError) opts?.onSuccess?.(createdArena);
  },
);
let createError: Error | null = null;
const createReset = vi.fn();

vi.mock("../api/use-create-arena", () => ({
  useCreateArena: () => ({
    mutate: createMutate,
    isPending: false,
    error: createError,
    reset: createReset,
  }),
}));

describe("CreateArenaDialog", () => {
  beforeEach(() => {
    createError = null;
    vi.clearAllMocks();
  });

  it("shows an inline error for an empty name and does not submit or close (AC-6)", () => {
    const onOpenChange = vi.fn();
    render(<CreateArenaDialog tournamentId="t1" open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Добавить площадку" }));

    expect(screen.getByText("Введите название")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("submits name/description, closes and notifies the parent on success (AC-6)", () => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    render(
      <CreateArenaDialog tournamentId="t1" open onOpenChange={onOpenChange} onCreated={onCreated} />,
    );

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Арена 5" } });
    fireEvent.change(screen.getByLabelText("Описание / локация"), {
      target: { value: "запасной ковёр" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Добавить площадку" }));

    expect(createMutate).toHaveBeenCalledWith(
      { name: "Арена 5", description: "запасной ковёр" },
      expect.anything(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreated).toHaveBeenCalledWith(createdArena);
  });

  it("a server error keeps the dialog open with entered values still filled in", () => {
    createError = new Error("name is required");
    const onOpenChange = vi.fn();
    render(<CreateArenaDialog tournamentId="t1" open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "Арена 5" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить площадку" }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("name is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Название")).toHaveValue("Арена 5");
  });
});
