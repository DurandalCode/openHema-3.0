// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NominationPools } from "./nomination-pools";
import type { FighterRef, Pool, PoolLayout } from "@/entities/pool/lib/types";

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

function fighter(id: string, name: string, club: string): FighterRef {
  return { fighterId: id, name, club };
}

function pool(id: string, name: string, members: FighterRef[]): Pool {
  return {
    id,
    nominationId: "n1",
    nominationName: "Номинация",
    number: 1,
    name,
    members,
    status: "POOL_STATUS_NOT_READY",
    arenaId: "",
    arenaName: "",
    standings: [],
  };
}

const stage = {
  id: "stage-1",
  nominationId: "n1",
  position: 0,
  title: "Групповой этап",
  type: "STAGE_TYPE_GROUPS" as const,
  status: "POOL_LAYOUT_STATUS_DRAFT" as const,
  bracket: null,
  groups: null,
  rule: null,
};

const layout: PoolLayout = {
  nominationId: "n1",
  status: "POOL_LAYOUT_STATUS_DRAFT",
  unassigned: [],
  pools: [],
  canUndo: false,
  stage,
};

const fighterA = fighter("f1", "Ясь В.", "Гарда");
const fighterB = fighter("f2", "Круглов С.", "Ганза");
const fighterC = fighter("f3", "Берг И.", "Гарда");

/** Раскладка с непустым пулом, пустым пулом и одним нераспределённым — для сводки/AC-1, DnD/AC-9, undo-кнопки/AC-7. */
const layoutWithPools: PoolLayout = {
  ...layout,
  canUndo: true,
  unassigned: [fighterC],
  pools: [pool("pool-1", "Пул 1", [fighterA, fighterB]), pool("pool-2", "Пул 2", [])],
};

/** Раскладка с пустыми нераспределёнными и одним пустым пулом — различение пустых состояний, AC-13. */
const layoutForEmptyStates: PoolLayout = {
  ...layout,
  pools: [pool("pool-2", "Пул 2", [])],
};

// NominationPools зовёт девять хуков напрямую (useLayout/useBouts — useQuery,
// остальные — useMutation). Здесь проверяется рендер и обвязка тостов по
// данным раскладки — все хуки мокаются управляемыми заглушками без сети/
// QueryClient (по образцу useNominationLive в nomination-pools-public.test.tsx).
const useLayoutMock = vi.fn();
const createMutate = vi.fn();
const deleteMutate = vi.fn();
const resetMutate = vi.fn();
const assignMutate = vi.fn();
const unassignMutate = vi.fn();
const autoDistributeMutate = vi.fn();
const undoMutate = vi.fn();
const setStatusMutate = vi.fn();
const toastSuccessMock = vi.fn();
const toastUndoMock = vi.fn();
const toastErrorMock = vi.fn();

let capturedOnDragEnd: ((event: unknown) => void) | undefined;

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    // Реальный DndContext требует настоящих pointer/gesture-событий, которых
    // jsdom не эмулирует; тут перехватывается только `onDragEnd`, чтобы
    // вызвать его напрямую синтетическим событием (AC-9) — `useDraggable`/
    // `useDroppable` внутри детей остаются настоящими (dnd-kit отдаёт им
    // безопасный дефолтный контекст без Provider).
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd?: (event: unknown) => void;
    }) => {
      capturedOnDragEnd = onDragEnd;
      return children;
    },
  };
});

vi.mock("../api/use-layout", () => ({ useLayout: (...args: unknown[]) => useLayoutMock(...args) }));
vi.mock("../api/use-create-pool", () => ({
  useCreatePool: () => ({ mutate: createMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-delete-pool", () => ({
  useDeletePool: () => ({ mutate: deleteMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-reset-layout", () => ({
  useResetLayout: () => ({ mutate: resetMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-assign-fighter", () => ({
  useAssignFighter: () => ({ mutate: assignMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-unassign-fighter", () => ({
  useUnassignFighter: () => ({ mutate: unassignMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-auto-distribute", () => ({
  useAutoDistribute: () => ({ mutate: autoDistributeMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-undo", () => ({
  useUndo: () => ({ mutate: undoMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-set-layout-status", () => ({
  useSetLayoutStatus: () => ({ mutate: setStatusMutate, isPending: false, error: null }),
}));
vi.mock("../api/use-bouts", () => ({ useBouts: () => ({ data: [] }) }));
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (message: string) => toastSuccessMock(message),
  toastUndo: (message: string, options: { onUndo: () => void }) => toastUndoMock(message, options),
  toastError: (message: string, options?: { retry?: () => void }) => toastErrorMock(message, options),
}));

beforeEach(() => {
  vi.resetAllMocks();
  useLayoutMock.mockReturnValue({ data: layout, isLoading: false, error: null, refetch: vi.fn() });
});

describe("NominationPools", () => {
  // Спека 0017, FR-11/AC-3: на экране раскладки номинации состав по группам
  // подписан названием этапа, которому он принадлежит.
  it("renders the stage title above the pool grid", () => {
    const { container } = render(<NominationPools stageId="stage-1" />);

    expect(container).toHaveTextContent("Групповой этап");
  });

  // Спека 0030, FR-1/AC-1: сводка состава раскладки в тулбаре.
  it("shows the assigned/total and pool count summary", () => {
    useLayoutMock.mockReturnValue({
      data: layoutWithPools,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NominationPools stageId="stage-1" />);

    expect(screen.getByText("2 / 3 распределено · 2 пула")).toBeInTheDocument();
  });

  // Спека 0030, FR-2/AC-2: новые подписи кнопок, старых на экране нет.
  it("uses the new action button labels, not the old ones", () => {
    render(<NominationPools stageId="stage-1" />);

    expect(screen.getByRole("button", { name: "+ Пул" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Распределить автоматически" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Зафиксировать" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить группу" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Распределить по группам" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Зафиксировать раскладку" })).not.toBeInTheDocument();
  });

  // Спека 0030, FR-3/AC-3: создание пула — тост-успех/тост-ошибка без retry.
  it("creating a pool shows a success toast", () => {
    createMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "+ Пул" }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Пул создан");
  });

  it("a failed pool creation shows an error toast without retry", () => {
    createMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("Действие недоступно"));
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "+ Пул" }));

    expect(toastErrorMock).toHaveBeenCalledWith("Действие недоступно", undefined);
  });

  // Спека 0030, FR-4/AC-4: удаление пула — сразу, без ConfirmDialog, тост
  // «Отменить» вызывает тот же undo-слот, что и кнопка тулбара.
  it("deleting a pool calls delete immediately (no confirm dialog) and offers Отменить in the toast", () => {
    useLayoutMock.mockReturnValue({
      data: layoutWithPools,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    deleteMutate.mockImplementation((_id, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить Пул 1" }));

    expect(deleteMutate).toHaveBeenCalledWith(
      "pool-1",
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(toastUndoMock).toHaveBeenCalledWith(
      "Пул удалён",
      expect.objectContaining({ onUndo: expect.any(Function) }),
    );

    toastUndoMock.mock.calls[0][1].onUndo();
    expect(undoMutate).toHaveBeenCalledTimes(1);
  });

  it("a failed pool deletion shows an error toast without retry", () => {
    useLayoutMock.mockReturnValue({
      data: layoutWithPools,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    deleteMutate.mockImplementation((_id, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("Действие недоступно"));
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить Пул 1" }));

    expect(toastErrorMock).toHaveBeenCalledWith("Действие недоступно", undefined);
    // Спека 0030, FR-10/AC-10: постоянного баннера с текстом ошибки нет.
    expect(screen.queryByText("Действие недоступно")).not.toBeInTheDocument();
  });

  // Спека 0030, FR-5/AC-5: автораспределение — тот же undo-слот в тосте.
  it("auto-distributing shows an undo toast whose Отменить calls the shared undo mutation", () => {
    autoDistributeMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Распределить автоматически" }));

    expect(toastUndoMock).toHaveBeenCalledWith(
      "Раскладка обновлена",
      expect.objectContaining({ onUndo: expect.any(Function) }),
    );

    toastUndoMock.mock.calls[0][1].onUndo();
    expect(undoMutate).toHaveBeenCalledTimes(1);
  });

  it("a failed auto-distribute shows an error toast without retry", () => {
    autoDistributeMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("Действие недоступно"));
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Распределить автоматически" }));

    expect(toastErrorMock).toHaveBeenCalledWith("Действие недоступно", undefined);
  });

  // Спека 0030, FR-7/AC-7: кнопка «Отменить» тулбара — тихий успех, тост на ошибку.
  it("a successful toolbar Отменить shows no toast", () => {
    useLayoutMock.mockReturnValue({
      data: layoutWithPools,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    undoMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));

    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastUndoMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("a failed toolbar Отменить shows an error toast without retry", () => {
    useLayoutMock.mockReturnValue({
      data: layoutWithPools,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    undoMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("Отменить нечего"));
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));

    expect(toastErrorMock).toHaveBeenCalledWith("Отменить нечего", undefined);
  });

  // Спека 0030, FR-8/AC-8: смена статуса — тост по направлению перехода.
  it("fixing the layout shows a success toast", () => {
    setStatusMutate.mockImplementation((_status, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Зафиксировать" }));

    expect(setStatusMutate).toHaveBeenCalledWith("ready", expect.objectContaining({ onSuccess: expect.any(Function) }));
    expect(toastSuccessMock).toHaveBeenCalledWith("Раскладка зафиксирована");
  });

  it("returning to draft shows its own success toast", () => {
    useLayoutMock.mockReturnValue({
      data: { ...layout, status: "POOL_LAYOUT_STATUS_READY" },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    setStatusMutate.mockImplementation((_status, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Вернуть в черновик" }));

    expect(setStatusMutate).toHaveBeenCalledWith("draft", expect.objectContaining({ onSuccess: expect.any(Function) }));
    expect(toastSuccessMock).toHaveBeenCalledWith("Раскладка возвращена в черновик");
  });

  it("a failed status change shows an error toast without retry", () => {
    setStatusMutate.mockImplementation((_status, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("Действие недоступно"));
    });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Зафиксировать" }));

    expect(toastErrorMock).toHaveBeenCalledWith("Действие недоступно", undefined);
  });

  // Спека 0030, FR-9/AC-9: DnD — тихий успех, тост на ошибку.
  it("a successful drag calls assign without a toast", () => {
    useLayoutMock.mockReturnValue({
      data: layoutWithPools,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    assignMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<NominationPools stageId="stage-1" />);
    capturedOnDragEnd?.({
      active: { data: { current: { fighterId: "f3", fromPoolId: null } } },
      over: { data: { current: { poolId: "pool-1" } } },
    });

    expect(assignMutate).toHaveBeenCalledWith(
      { fighterId: "f3", poolId: "pool-1" },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastUndoMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("a failed drag rolls back and shows an error toast without retry", () => {
    useLayoutMock.mockReturnValue({
      data: layoutWithPools,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    assignMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("Действие недоступно"));
    });

    render(<NominationPools stageId="stage-1" />);
    capturedOnDragEnd?.({
      active: { data: { current: { fighterId: "f3", fromPoolId: null } } },
      over: { data: { current: { poolId: "pool-1" } } },
    });

    expect(toastErrorMock).toHaveBeenCalledWith("Действие недоступно", undefined);
  });

  // Спека 0030, FR-11/AC-11: скелетон вместо текста «Загрузка…».
  it("shows a skeleton (not 'Загрузка…') while the layout is loading", () => {
    useLayoutMock.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });

    render(<NominationPools stageId="stage-1" />);

    expect(screen.queryByText("Загрузка…")).not.toBeInTheDocument();
    expect(screen.getByTestId("nomination-pools-skeleton")).toBeInTheDocument();
  });

  // Спека 0030, FR-12/AC-12: ошибка загрузки — сообщение с «Повторить».
  it("shows a retry button on load error that calls refetch", () => {
    const refetch = vi.fn();
    useLayoutMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom"), refetch });

    render(<NominationPools stageId="stage-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // Спека 0030, FR-13/AC-13: пустые состояния различаются.
  it("differentiates the empty unassigned column from an empty pool", () => {
    useLayoutMock.mockReturnValue({
      data: layoutForEmptyStates,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NominationPools stageId="stage-1" />);

    expect(screen.getByText("Пусто")).toBeInTheDocument();
    expect(screen.getByText("Перетащите бойца сюда")).toBeInTheDocument();
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
