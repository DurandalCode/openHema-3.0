// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NominationPools } from "./nomination-pools";
import type { BoardBout, FighterRef, Pool, PoolLayout } from "@/entities/pool/lib/types";
import type { LivePoolDto } from "@/entities/nomination-live/lib/types";
import { UnauthorizedError } from "@/shared/api/unauthorized";

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
  executionStatus: "STAGE_STATUS_UNSPECIFIED" as const,
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

/**
 * Живой пул (спека 0051): бои со счётом и состоянием, как их отдаёт
 * `GetNominationLiveSnapshot`. Именно отсюда карточка группы берёт
 * результаты — `ListBoutsByNomination` их по контракту не несёт.
 */
function boardBout(overrides: Partial<BoardBout> = {}): BoardBout {
  return {
    id: "b1",
    roundNumber: 1,
    sequenceNumber: 1,
    fighterA,
    fighterB,
    state: "BOUT_STATE_NOT_STARTED",
    scoreA: 0,
    scoreB: 0,
    ...overrides,
  };
}

function livePool(bouts: BoardBout[], currentBoutId = ""): LivePoolDto {
  return {
    pool: pool("pool-1", "Пул 1", [fighterA, fighterB]),
    bouts,
    currentBoutId,
  };
}

/** Зафиксированная раскладка — только в ней вообще существуют бои. */
const readyLayout: PoolLayout = {
  ...layout,
  status: "POOL_LAYOUT_STATUS_READY",
  pools: [pool("pool-1", "Пул 1", [fighterA, fighterB])],
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
    const { container } = render(<NominationPools stageId="stage-1" livePools={[]} />);

    expect(container).toHaveTextContent("Групповой этап");
  });

  // Спека 0032, FR-3: статус/сводка/фиксация ушли из тулбара в PageHeader —
  // на экране их больше нет ни в каком виде.
  it("no longer renders status, summary, or the fixation button in the toolbar", () => {
    useLayoutMock.mockReturnValue({
      data: layoutWithPools,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NominationPools stageId="stage-1" livePools={[]} />);

    expect(screen.queryByText("черновик")).not.toBeInTheDocument();
    expect(screen.queryByText("готово")).not.toBeInTheDocument();
    expect(screen.queryByText("2 / 3 распределено · 2 пула")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Зафиксировать" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Вернуть в черновик" })).not.toBeInTheDocument();
  });

  // Спека 0030, FR-2/AC-2: новые подписи кнопок, старых на экране нет.
  it("uses the new action button labels, not the old ones", () => {
    render(<NominationPools stageId="stage-1" livePools={[]} />);

    expect(screen.getByRole("button", { name: "+ Пул" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Распределить автоматически" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить группу" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Распределить по группам" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Зафиксировать раскладку" })).not.toBeInTheDocument();
  });

  // Спека 0032, FR-3: read-only при ready по-прежнему прячет действия
  // тулбара (кнопка фиксации ушла, но сам гейтинг остался).
  it("hides all toolbar actions when the layout is ready (read-only)", () => {
    useLayoutMock.mockReturnValue({
      data: { ...layout, status: "POOL_LAYOUT_STATUS_READY" },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NominationPools stageId="stage-1" livePools={[]} />);

    expect(screen.queryByRole("button", { name: "+ Пул" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Распределить автоматически" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отменить" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Сбросить раскладку/ })).not.toBeInTheDocument();
  });

  // Спека 0030, FR-3/AC-3: создание пула — тост-успех/тост-ошибка без retry.
  it("creating a pool shows a success toast", () => {
    createMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    render(<NominationPools stageId="stage-1" livePools={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Пул" }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Пул создан");
  });

  it("a failed pool creation shows an error toast without retry", () => {
    createMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("Действие недоступно"));
    });

    render(<NominationPools stageId="stage-1" livePools={[]} />);
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

    render(<NominationPools stageId="stage-1" livePools={[]} />);
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

    render(<NominationPools stageId="stage-1" livePools={[]} />);
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

    render(<NominationPools stageId="stage-1" livePools={[]} />);
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

    render(<NominationPools stageId="stage-1" livePools={[]} />);
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

    render(<NominationPools stageId="stage-1" livePools={[]} />);
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

    render(<NominationPools stageId="stage-1" livePools={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));

    expect(toastErrorMock).toHaveBeenCalledWith("Отменить нечего", undefined);
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

    render(<NominationPools stageId="stage-1" livePools={[]} />);
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

    render(<NominationPools stageId="stage-1" livePools={[]} />);
    capturedOnDragEnd?.({
      active: { data: { current: { fighterId: "f3", fromPoolId: null } } },
      over: { data: { current: { poolId: "pool-1" } } },
    });

    expect(toastErrorMock).toHaveBeenCalledWith("Действие недоступно", undefined);
  });

  // Спека 0030, FR-11/AC-11: скелетон вместо текста «Загрузка…».
  it("shows a skeleton (not 'Загрузка…') while the layout is loading", () => {
    useLayoutMock.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });

    render(<NominationPools stageId="stage-1" livePools={[]} />);

    expect(screen.queryByText("Загрузка…")).not.toBeInTheDocument();
    expect(screen.getByTestId("nomination-pools-skeleton")).toBeInTheDocument();
  });

  // Спека 0030, FR-12/AC-12: ошибка загрузки — сообщение с «Повторить».
  it("shows a retry button on load error that calls refetch", () => {
    const refetch = vi.fn();
    useLayoutMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom"), refetch });

    render(<NominationPools stageId="stage-1" livePools={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // Спека 0039, FR-18/AC-12: истёкшая сессия — без собственного блока ошибки.
  it("does not render its own error block when the session expired", () => {
    useLayoutMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new UnauthorizedError(),
      refetch: vi.fn(),
    });

    render(<NominationPools stageId="stage-1" livePools={[]} />);

    expect(screen.queryByRole("button", { name: "Повторить" })).not.toBeInTheDocument();
  });

  // Спека 0030, FR-13/AC-13: пустые состояния различаются.
  it("differentiates the empty unassigned column from an empty pool", () => {
    useLayoutMock.mockReturnValue({
      data: layoutForEmptyStates,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<NominationPools stageId="stage-1" livePools={[]} />);

    expect(screen.getByText("Пусто")).toBeInTheDocument();
    expect(screen.getByText("Перетащите бойца сюда")).toBeInTheDocument();
  });

  // Спека 0023, FR-8/AC-7: сброс раскладки идёт через ConfirmDialog
  // дизайн-системы, а не системный window.confirm.
  it("opens ConfirmDialog instead of window.confirm on reset click", () => {
    render(<NominationPools stageId="stage-1" livePools={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /Сбросить раскладку/ }));

    expect(screen.getByText("Сбросить раскладку?")).toBeInTheDocument();
    expect(
      screen.getByText("Все пулы будут удалены, бойцы вернутся в нераспределённые."),
    ).toBeInTheDocument();
  });

  it("cancelling the dialog does not call resetLayout.mutate", () => {
    render(<NominationPools stageId="stage-1" livePools={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /Сбросить раскладку/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(resetMutate).not.toHaveBeenCalled();
  });

  // Спека 0023, FR-8: успех — toastUndo с «Отменить» поверх существующего undo.
  it("confirming reset calls mutate and shows an undo toast on success", () => {
    resetMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
      options.onSuccess?.();
    });

    render(<NominationPools stageId="stage-1" livePools={[]} />);

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

    render(<NominationPools stageId="stage-1" livePools={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /Сбросить раскладку/ }));
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock.mock.calls[0][0]).toBe("сеть недоступна");
    expect(toastErrorMock.mock.calls[0][1]?.retry).toBeTypeOf("function");
  });

  // Спека 0039, T10/AC-14: клавиатурный путь к переносу — меню «Переместить»
  // на карточке бойца зовёт ту же мутацию, что и drop.
  describe("keyboard move menu (FighterCard)", () => {
    function openMoveMenu(fighterName: string) {
      const trigger = screen.getByRole("button", { name: `Переместить ${fighterName}` });
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
      fireEvent.click(trigger);
    }

    beforeEach(() => {
      useLayoutMock.mockReturnValue({
        data: layoutWithPools,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it("lists every other pool but not the fighter's current pool, plus «В нераспределённые» when assigned", () => {
      render(<NominationPools stageId="stage-1" livePools={[]} />);

      // fighterA живёт в pool-1 — меню предлагает pool-2 и снятие, но не pool-1.
      openMoveMenu("Ясь В.");
      expect(screen.getByRole("menuitem", { name: "В Пул 2" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "В Пул 1" })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "В нераспределённые" })).toBeInTheDocument();
    });

    it("does not offer «В нераспределённые» for a fighter already unassigned", () => {
      render(<NominationPools stageId="stage-1" livePools={[]} />);

      // fighterC (Берг И.) — нераспределён: обоим пулам можно, снимать неоткуда.
      openMoveMenu("Берг И.");
      expect(screen.getByRole("menuitem", { name: "В Пул 1" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "В Пул 2" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "В нераспределённые" })).not.toBeInTheDocument();
    });

    it("selecting a pool from the menu calls assign with the same shape as drop, and shows a success toast", () => {
      render(<NominationPools stageId="stage-1" livePools={[]} />);

      openMoveMenu("Берг И.");
      fireEvent.click(screen.getByRole("menuitem", { name: "В Пул 1" }));

      expect(assignMutate).toHaveBeenCalledWith(
        { fighterId: "f3", poolId: "pool-1" },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it("shows a success toast naming the fighter and destination pool after a successful menu assign", () => {
      assignMutate.mockImplementation((_vars, options: { onSuccess?: () => void }) => {
        options?.onSuccess?.();
      });

      render(<NominationPools stageId="stage-1" livePools={[]} />);
      openMoveMenu("Берг И.");
      fireEvent.click(screen.getByRole("menuitem", { name: "В Пул 1" }));

      expect(toastSuccessMock).toHaveBeenCalledWith("Берг И. → Пул 1");
    });

    it("selecting «В нераспределённые» calls unassign with the fighter id and shows a success toast", () => {
      unassignMutate.mockImplementation((_id, options: { onSuccess?: () => void }) => {
        options?.onSuccess?.();
      });

      render(<NominationPools stageId="stage-1" livePools={[]} />);
      openMoveMenu("Ясь В.");
      fireEvent.click(screen.getByRole("menuitem", { name: "В нераспределённые" }));

      expect(unassignMutate).toHaveBeenCalledWith(
        "f1",
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
      expect(toastSuccessMock).toHaveBeenCalledWith("Ясь В. → Нераспределённые");
    });

    it("shows an error toast when a menu assign fails", () => {
      assignMutate.mockImplementation((_vars, options: { onError?: (err: Error) => void }) => {
        options?.onError?.(new Error("Действие недоступно"));
      });

      render(<NominationPools stageId="stage-1" livePools={[]} />);
      openMoveMenu("Берг И.");
      fireEvent.click(screen.getByRole("menuitem", { name: "В Пул 1" }));

      expect(toastErrorMock).toHaveBeenCalledWith("Действие недоступно", undefined);
      expect(toastSuccessMock).not.toHaveBeenCalled();
    });

    it("does not render the move menu button when the layout is read-only", () => {
      useLayoutMock.mockReturnValue({
        data: { ...layoutWithPools, status: "POOL_LAYOUT_STATUS_READY" },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<NominationPools stageId="stage-1" livePools={[]} />);

      expect(screen.queryByRole("button", { name: /Переместить/ })).not.toBeInTheDocument();
    });
  });

  // Спека 0051 — результаты боёв в админской статистике этапа.
  describe("результаты боёв группы (спека 0051)", () => {
    beforeEach(() => {
      useLayoutMock.mockReturnValue({
        data: readyLayout,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    // AC-1
    it("показывает счёт, состояние и исход завершённого боя", () => {
      render(
        <NominationPools
          stageId="stage-1"
          livePools={[
            livePool([
              boardBout({ state: "BOUT_STATE_FINISHED", scoreA: 5, scoreB: 3 }),
            ]),
          ]}
        />,
      );

      expect(screen.getByText("5:3")).toBeInTheDocument();
      expect(screen.getByText("завершён")).toBeInTheDocument();
      expect(screen.getByText(`Исход: ${fighterA.name}`)).toBeInTheDocument();
    });

    // AC-2
    it("называет ничью ничьёй и никого не объявляет победителем", () => {
      render(
        <NominationPools
          stageId="stage-1"
          livePools={[
            livePool([
              boardBout({ state: "BOUT_STATE_FINISHED", scoreA: 3, scoreB: 3 }),
            ]),
          ]}
        />,
      );

      expect(screen.getByText("Исход: ничья")).toBeInTheDocument();
      expect(screen.queryByText(`Исход: ${fighterA.name}`)).not.toBeInTheDocument();
      expect(screen.queryByText(`Исход: ${fighterB.name}`)).not.toBeInTheDocument();
    });

    // AC-3: отсутствие результата не должно выглядеть нулевым результатом.
    it("не показывает 0:0 у не начатого боя", () => {
      render(<NominationPools stageId="stage-1" livePools={[livePool([boardBout()])]} />);

      expect(screen.queryByText("0:0")).not.toBeInTheDocument();
      expect(screen.getByText("—:—")).toBeInTheDocument();
      expect(screen.getByText("не начат")).toBeInTheDocument();
    });

    // AC-4
    it("показывает промежуточный счёт идущего боя", () => {
      render(
        <NominationPools
          stageId="stage-1"
          livePools={[
            livePool([boardBout({ state: "BOUT_STATE_IN_PROGRESS", scoreA: 2, scoreB: 1 })], "b1"),
          ]}
        />,
      );

      expect(screen.getByText("2:1")).toBeInTheDocument();
      expect(screen.getByText("идёт")).toBeInTheDocument();
    });

    // Регрессия: блок боёв существует только у зафиксированной раскладки —
    // в черновике боёв ещё нет, и живой снапшот там пуст по контракту.
    it("не рисует бои, пока раскладка в черновике", () => {
      useLayoutMock.mockReturnValue({
        data: layoutWithPools,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<NominationPools stageId="stage-1" livePools={[]} />);

      expect(screen.queryByText("Бои")).not.toBeInTheDocument();
    });
  });
});
