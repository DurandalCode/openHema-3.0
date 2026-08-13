// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Nomination } from "@/entities/nomination/lib/types";
import { CreateFighterDialog } from "./create-fighter-dialog";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  if (!("ResizeObserver" in window)) {
    // @ts-expect-error - минимальный polyfill для jsdom (Checkbox использует radix use-size)
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  cleanup();
});

const createdFighter = { id: "f1", name: "Иван", club: "", fromApplication: false };

const createMutate = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: (f: typeof createdFighter) => void }) => {
    if (!createError) opts?.onSuccess?.(createdFighter);
  },
);
let createError: Error | null = null;
const createReset = vi.fn();

vi.mock("../api/use-fighter-mutations", () => ({
  useCreateFighter: () => ({
    mutate: createMutate,
    isPending: false,
    error: createError,
    reset: createReset,
  }),
}));

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

const nominations = [nomination({ id: "n1", title: "Лонгсворд" }), nomination({ id: "n2", title: "Сабля" })];

describe("CreateFighterDialog", () => {
  beforeEach(() => {
    createError = null;
    vi.clearAllMocks();
  });

  it("shows an inline error for an empty name and does not submit or close (AC-13)", () => {
    const onOpenChange = vi.fn();
    render(
      <CreateFighterDialog tournamentId="t1" nominations={nominations} open onOpenChange={onOpenChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Завести бойца" }));

    expect(screen.getByText("Введите имя")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("submits name/club/selected nominations, closes and notifies the parent on success (AC-13)", () => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    render(
      <CreateFighterDialog
        tournamentId="t1"
        nominations={nominations}
        open
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Иван" } });
    fireEvent.change(screen.getByLabelText("Клуб"), { target: { value: "Сокол" } });
    fireEvent.click(screen.getByLabelText("Сабля"));
    fireEvent.click(screen.getByRole("button", { name: "Завести бойца" }));

    expect(createMutate).toHaveBeenCalledWith(
      { tournamentId: "t1", name: "Иван", club: "Сокол", nominationIds: ["n2"] },
      expect.anything(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreated).toHaveBeenCalledWith(createdFighter);
  });

  it("a server error keeps the dialog open with entered values still filled in", () => {
    createError = new Error("Имя занято");
    const onOpenChange = vi.fn();
    render(
      <CreateFighterDialog tournamentId="t1" nominations={nominations} open onOpenChange={onOpenChange} />,
    );

    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Иван" } });
    fireEvent.click(screen.getByRole("button", { name: "Завести бойца" }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("Имя занято")).toBeInTheDocument();
    expect(screen.getByLabelText("Имя")).toHaveValue("Иван");
  });
});
