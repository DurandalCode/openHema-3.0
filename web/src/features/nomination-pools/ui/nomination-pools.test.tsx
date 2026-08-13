// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NominationPools } from "./nomination-pools";
import type { PoolLayout } from "@/entities/pool/lib/types";

/**
 * Radix `Dialog`/`FocusScope` в jsdom требуют pointer-capture/scrollIntoView
 * полифиллов, которых jsdom не реализует (см. `shared/ui/dialog.test.tsx`).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

const layout: PoolLayout = {
  nominationId: "n1",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  unassigned: [],
  pools: [],
  canUndo: false,
  stage: {
    id: "stage-1",
    nominationId: "n1",
    position: 0,
    title: "Групповой этап",
    type: "STAGE_TYPE_GROUPS",
    status: "POOL_LAYOUT_STATUS_DRAFT",
    bracket: null,
    groups: null,
    rule: null,
  },
};

/** mutationStub — заглушка результата useMutation (TanStack Query), минимум полей, которые читает компонент. */
function mutationStub() {
  return { mutate: vi.fn(), isPending: false, error: null };
}

const resetMutate = vi.fn();
const undoMutate = vi.fn();
const toastUndoMock = vi.fn();
const toastErrorMock = vi.fn();

// NominationPools зовёт девять хуков напрямую (useLayout/useBouts — useQuery,
// остальные — useMutation). Здесь проверяется чистый рендер по данным
// раскладки, поэтому все хуки мокаются заглушками без сети/QueryClient — по
// образцу useNominationLive в nomination-pools-public.test.tsx.
vi.mock("../api/use-layout", () => ({
  useLayout: () => ({ data: layout, isLoading: false, error: null }),
}));
vi.mock("../api/use-create-pool", () => ({ useCreatePool: () => mutationStub() }));
vi.mock("../api/use-delete-pool", () => ({ useDeletePool: () => mutationStub() }));
vi.mock("../api/use-reset-layout", () => ({
  useResetLayout: () => ({ mutate: resetMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-assign-fighter", () => ({ useAssignFighter: () => mutationStub() }));
vi.mock("../api/use-unassign-fighter", () => ({ useUnassignFighter: () => mutationStub() }));
vi.mock("../api/use-auto-distribute", () => ({ useAutoDistribute: () => mutationStub() }));
vi.mock("../api/use-undo", () => ({
  useUndo: () => ({ mutate: undoMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-set-layout-status", () => ({ useSetLayoutStatus: () => mutationStub() }));
vi.mock("../api/use-bouts", () => ({ useBouts: () => ({ data: [] }) }));
vi.mock("@/shared/lib/toast", () => ({
  toastUndo: (message: string, options: { onUndo: () => void }) => toastUndoMock(message, options),
  toastError: (message: string, options?: { retry?: () => void }) => toastErrorMock(message, options),
}));

/**
 * Radix `Dialog`/`FocusScope` в jsdom требуют pointer-capture/scrollIntoView
 * полифиллов, которых jsdom не реализует (см. `shared/ui/dialog.test.tsx`).
 */
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

describe("NominationPools", () => {
  // Спека 0017, FR-11/AC-3: на экране раскладки номинации состав по группам
  // подписан названием этапа, которому он принадлежит.
  it("renders the stage title above the pool grid", () => {
    const { container } = render(<NominationPools stageId="stage-1" />);

    expect(container).toHaveTextContent("Групповой этап");
  });

  // Спека 0023, FR-8/AC-7: сброс раскладки идёт через ConfirmDialog
  // дизайн-системы, а не системный window.confirm.
  it("opens ConfirmDialog instead of window.confirm on reset click", () => {
    render(<NominationPools stageId="stage-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Сбросить раскладку/ }));

    expect(screen.getByText("Сбросить раскладку?")).toBeInTheDocument();
    expect(
      screen.getByText("Все пулы будут удалены, бойцы вернутся в нераспределённые."),
    ).toBeInTheDocument();
  });

  it("cancelling the dialog does not call resetLayout.mutate", () => {
    render(<NominationPools stageId="stage-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Сбросить раскладку/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(resetMutate).not.toHaveBeenCalled();
  });

  // Спека 0023, FR-8: успех — toastUndo с «Отменить» поверх существующего undo.
  it("confirming reset calls mutate and shows an undo toast on success", () => {
    resetMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options.onSuccess?.();
    });

    render(<NominationPools stageId="stage-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Сбросить раскладку/ }));
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));

    expect(resetMutate).toHaveBeenCalledTimes(1);
    expect(toastUndoMock).toHaveBeenCalledTimes(1);
    expect(toastUndoMock.mock.calls[0][0]).toBe("Раскладка сброшена");

    // Нажатие «Отменить» в тосте зовёт существующий undo (спека 0009, FR-7a).
    toastUndoMock.mock.calls[0][1].onUndo();
    expect(undoMutate).toHaveBeenCalledTimes(1);
  });

  it("shows a retryable error toast when reset fails", () => {
    resetMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options.onError?.(new Error("сеть недоступна"));
    });

    render(<NominationPools stageId="stage-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Сбросить раскладку/ }));
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock.mock.calls[0][0]).toBe("сеть недоступна");
    expect(toastErrorMock.mock.calls[0][1]?.retry).toBeTypeOf("function");
  });
});
