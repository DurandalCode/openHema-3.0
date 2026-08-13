// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Arena } from "@/entities/arena/lib/types";
import { EditArenaDialog } from "./edit-arena-dialog";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
});

afterEach(() => {
  cleanup();
});

function arena(overrides: Partial<Arena>): Arena {
  return {
    id: "a1",
    tournamentId: "t1",
    name: "Арена 2",
    description: "малый ковёр · у окна",
    position: 1,
    status: "ARENA_STATUS_ACTIVE",
    defaultDurationSeconds: 180,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const updatedArena = { id: "a1", name: "Арена 2 обновлена", description: "" };

const updateMutate = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: (a: typeof updatedArena) => void }) => {
    if (!updateError) opts?.onSuccess?.(updatedArena);
  },
);
let updateError: Error | null = null;
const updateReset = vi.fn();

const setDurationMutate = vi.fn();

vi.mock("../api/use-update-arena", () => ({
  useUpdateArena: () => ({
    mutate: updateMutate,
    isPending: false,
    error: updateError,
    reset: updateReset,
  }),
}));

vi.mock("../api/use-set-default-duration", () => ({
  useSetDefaultDuration: () => ({
    mutate: setDurationMutate,
    isPending: false,
    error: null,
  }),
}));

describe("EditArenaDialog", () => {
  beforeEach(() => {
    updateError = null;
    vi.clearAllMocks();
  });

  it("saves changed name/description and closes on success (AC-7)", () => {
    const onOpenChange = vi.fn();
    render(
      <EditArenaDialog
        tournamentId="t1"
        arena={arena({})}
        open
        onOpenChange={onOpenChange}
        onArchive={vi.fn()}
        archivePending={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Описание / локация"), {
      target: { value: "новое описание" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(updateMutate).toHaveBeenCalledWith(
      { id: "a1", input: { name: "Арена 2", description: "новое описание" } },
      expect.anything(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an inline error for an empty name and does not submit", () => {
    render(
      <EditArenaDialog
        tournamentId="t1"
        arena={arena({})}
        open
        onOpenChange={vi.fn()}
        onArchive={vi.fn()}
        archivePending={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Название"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(screen.getByText("Введите название")).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("selecting a quick duration preset and saving updates the default duration (AC-8)", () => {
    render(
      <EditArenaDialog
        tournamentId="t1"
        arena={arena({ defaultDurationSeconds: 180 })}
        open
        onOpenChange={vi.fn()}
        onArchive={vi.fn()}
        archivePending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "5:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(setDurationMutate).toHaveBeenCalledWith({ id: "a1", seconds: 300 });
    expect(
      screen.getByText(/применяется к новым боям.*идущий не затронет/i),
    ).toBeInTheDocument();
  });

  it("does not call the duration mutation when the duration was not changed", () => {
    render(
      <EditArenaDialog
        tournamentId="t1"
        arena={arena({ defaultDurationSeconds: 180 })}
        open
        onOpenChange={vi.fn()}
        onArchive={vi.fn()}
        archivePending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(setDurationMutate).not.toHaveBeenCalled();
  });

  it("offers a link to the arena page and the scoreboard", () => {
    render(
      <EditArenaDialog
        tournamentId="t1"
        arena={arena({})}
        open
        onOpenChange={vi.fn()}
        onArchive={vi.fn()}
        archivePending={false}
      />,
    );

    expect(screen.getByRole("link", { name: /Открыть площадку/ })).toHaveAttribute(
      "href",
      "/admin/arenas/a1",
    );
    expect(screen.getByRole("link", { name: /Табло/ })).toHaveAttribute(
      "href",
      "/admin/arenas/a1/scoreboard",
    );
  });

  it("clicking 'Убрать в архив' calls onArchive and closes the dialog (FR-12)", () => {
    const onArchive = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <EditArenaDialog
        tournamentId="t1"
        arena={arena({})}
        open
        onOpenChange={onOpenChange}
        onArchive={onArchive}
        archivePending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Убрать в архив" }));

    expect(onArchive).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a server error on save keeps the dialog open", () => {
    updateError = new Error("Ошибка сервера");
    const onOpenChange = vi.fn();
    render(
      <EditArenaDialog
        tournamentId="t1"
        arena={arena({})}
        open
        onOpenChange={onOpenChange}
        onArchive={vi.fn()}
        archivePending={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("Ошибка сервера")).toBeInTheDocument();
  });
});
