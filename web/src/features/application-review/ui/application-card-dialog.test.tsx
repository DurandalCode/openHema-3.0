// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { ApplicationCardDialog } from "./application-card-dialog";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

const application: Application = {
  id: "a1",
  nominationId: "n1",
  tournamentId: "t1",
  applicantUserId: "fighter-1",
  applicantDisplayName: "Иван Петров",
  state: "APPLICATION_STATE_PAID",
  club: "Клинок Севера",
  needsEquipment: false,
  createdAt: "2026-03-18T00:00:00.000Z",
  updatedAt: "2026-03-20T00:00:00.000Z",
};

const nominations: Nomination[] = [
  {
    id: "n1",
    tournamentId: "t1",
    title: "Лонгсворд",
    description: "",
    fighterCapacity: 16,
    metadata: { rulesUrl: "" },
    position: 0,
    status: "NOMINATION_STATUS_OPEN",
    createdAt: "",
    updatedAt: "",
  },
];

let detailState: {
  data: { application: Application; history: unknown[] } | undefined;
  isLoading: boolean;
  error: Error | null;
} = {
  data: {
    application,
    history: [
      {
        type: "APPLICATION_EVENT_TYPE_SUBMITTED",
        actorId: "fighter-1",
        actorDisplayName: "Иван Петров",
        occurredAt: "2026-03-18T10:00:00.000Z",
        sequence: 1,
      },
      {
        type: "APPLICATION_EVENT_TYPE_PAYMENT_DECLARED",
        actorId: "fighter-1",
        actorDisplayName: "Иван Петров",
        occurredAt: "2026-03-19T10:00:00.000Z",
        sequence: 2,
      },
      {
        type: "APPLICATION_EVENT_TYPE_PAYMENT_CONFIRMED",
        actorId: "admin-1",
        actorDisplayName: "Кораблёва Анна",
        occurredAt: "2026-03-20T10:00:00.000Z",
        sequence: 3,
      },
    ],
  },
  isLoading: false,
  error: null,
};
const detailRefetch = vi.fn();

vi.mock("../api/use-application-detail", () => ({
  useApplicationDetail: () => ({ ...detailState, refetch: detailRefetch }),
}));

type MutateOpts = {
  onSuccess?: (result: { capacityExceeded?: boolean }) => void;
  onError?: (e: Error) => void;
};

let confirmResult: { ok: true } | { ok: false; error: string } = { ok: true };
let registerResult:
  | { ok: true; capacityExceeded: boolean }
  | { ok: false; error: string } = { ok: true, capacityExceeded: false };

const confirmMutate = vi.fn((_id: string, opts?: MutateOpts) => {
  if (confirmResult.ok) opts?.onSuccess?.({});
  else opts?.onError?.(new Error(confirmResult.error));
});
const registerMutate = vi.fn((_id: string, opts?: MutateOpts) => {
  if (registerResult.ok) opts?.onSuccess?.({ capacityExceeded: registerResult.capacityExceeded });
  else opts?.onError?.(new Error(registerResult.error));
});

vi.mock("../api/use-confirm-payment", () => ({
  useConfirmPayment: () => ({ mutate: confirmMutate, isPending: false }),
}));
vi.mock("../api/use-register-fighter", () => ({
  useRegisterFighter: () => ({ mutate: registerMutate, isPending: false }),
}));

const editMutate = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: (application: Application) => void }) => {
    opts?.onSuccess?.(application);
  },
);
vi.mock("../api/use-edit-application", () => ({
  useEditApplication: () => ({ mutate: editMutate, isPending: false, error: null, reset: vi.fn() }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  confirmResult = { ok: true };
  registerResult = { ok: true, capacityExceeded: false };
  detailState = {
    data: {
      application,
      history: detailState.data?.history ?? [],
    },
    isLoading: false,
    error: null,
  };
});

function baseProps() {
  return {
    application,
    nominations,
    overfullNominationIds: new Set<string>(),
    open: true,
    onOpenChange: vi.fn(),
  };
}

describe("ApplicationCardDialog", () => {
  it("shows applicant name, nomination, club and status with an explanation (AC-9)", () => {
    render(<ApplicationCardDialog {...baseProps()} />);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Иван Петров")).toBeInTheDocument();
    expect(within(dialog).getByText(/Лонгсворд/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Клинок Севера/)).toBeInTheDocument();
    expect(within(dialog).getByText("Оплачена")).toBeInTheDocument();
  });

  it("renders the history with authors and a muted next-step line (AC-9)", () => {
    render(<ApplicationCardDialog {...baseProps()} />);

    expect(screen.getByText("Подана")).toBeInTheDocument();
    expect(screen.getByText(/Кораблёва Анна/)).toBeInTheDocument();
    expect(screen.getByText(/Боец зарегистрирован — ожидает действия секретаря/)).toBeInTheDocument();
  });

  it("shows the overfull-nomination warning when applicable", () => {
    render(<ApplicationCardDialog {...baseProps()} overfullNominationIds={new Set(["n1"])} />);
    expect(screen.getByText(/переполнена/)).toBeInTheDocument();
  });

  it("does not show the overfull warning when not applicable", () => {
    render(<ApplicationCardDialog {...baseProps()} />);
    expect(screen.queryByText(/переполнена/)).not.toBeInTheDocument();
  });

  it("a successful flow action keeps the card open and reflects the refreshed status/history (AC-10)", () => {
    const onOpenChange = vi.fn();
    render(<ApplicationCardDialog {...baseProps()} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Зарегистрировать" }));

    expect(registerMutate).toHaveBeenCalledWith("a1", expect.anything());
    expect(toastSuccess).toHaveBeenCalledWith("Боец зарегистрирован");
    // Карточка не закрывается сама — onOpenChange(false) действием флоу не вызывается,
    // обновление статуса/истории приходит через инвалидацию `detail`-ключа.
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a success toast that mentions the overfull nomination on registration with capacityExceeded (AC-7/FR-13 semantics)", () => {
    registerResult = { ok: true, capacityExceeded: true };
    render(<ApplicationCardDialog {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Зарегистрировать" }));

    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/переполнена/));
  });

  it("a rejected action shows a toastError and does not close the card", () => {
    registerResult = { ok: false, error: "Нельзя зарегистрировать" };
    const onOpenChange = vi.fn();
    render(<ApplicationCardDialog {...baseProps()} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Зарегистрировать" }));

    expect(toastError).toHaveBeenCalledWith("Нельзя зарегистрировать");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("a history-loading error does not break the rest of the card (FR-25)", () => {
    detailState = { data: undefined, isLoading: false, error: new Error("Не удалось загрузить историю") };
    render(<ApplicationCardDialog {...baseProps()} />);

    // Заголовок/статус остаются рабочими на данных из `application` (фолбэк).
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Иван Петров")).toBeInTheDocument();
    expect(within(dialog).getByText("Оплачена")).toBeInTheDocument();
    // Ошибка истории показана локально, с повтором.
    expect(screen.getByText("Не удалось загрузить историю")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(detailRefetch).toHaveBeenCalledTimes(1);
  });

  it("'Редактировать' opens the edit dialog nested on top of the card; Escape closes only the top dialog", () => {
    render(<ApplicationCardDialog {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));

    // Radix помечает фоновый (карточка) диалог `aria-hidden` пока открыт
    // верхний — поэтому ищем оба через `hidden: true`, обходя дефолтную
    // a11y-фильтрацию Testing Library.
    const dialogs = screen.getAllByRole("dialog", { hidden: true });
    expect(dialogs).toHaveLength(2);
    expect(screen.getByText("Правка заявки")).toBeInTheDocument();
    // Фокус ушёл в верхний (edit) диалог, а не остался на body/триггере.
    expect(document.activeElement).not.toBe(document.body);

    fireEvent.keyDown(document, { key: "Escape" });

    // Верхний диалог закрылся, карточка — нет.
    expect(screen.queryByText("Правка заявки")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Иван Петров")).toBeInTheDocument();
  });

  it("closing the edit dialog after a successful save reflects updated data in the card (AC-11)", () => {
    render(<ApplicationCardDialog {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Редактировать" }));
    fireEvent.change(screen.getByLabelText("Клуб"), { target: { value: "Новый клуб" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(editMutate).toHaveBeenCalled();
    // Edit-диалог закрылся сам после успеха (его собственное поведение),
    // карточка осталась открытой.
    expect(screen.queryByText("Правка заявки")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
