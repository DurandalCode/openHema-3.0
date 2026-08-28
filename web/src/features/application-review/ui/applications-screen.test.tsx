// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application, ApplicationState } from "@/entities/application/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import { ApplicationsScreen, PAGE_SIZE } from "./applications-screen";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

afterEach(() => {
  cleanup();
});

function app(overrides: Partial<Application>): Application {
  return {
    id: "a1",
    nominationId: "n1",
    tournamentId: "t1",
    applicantUserId: "fighter-1",
    applicantDisplayName: "Иван Петров",
    state: "APPLICATION_STATE_SUBMITTED",
    club: "Клинок",
    needsEquipment: false,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    ...overrides,
  };
}

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
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

// overviewFixture — весь список заявок «турнира» на стороне тестового
// double'а (спека 0041 переносит фильтр/поиск/постраничность/счётчики на
// сервер — мок `useApplicationsOverview` ниже симулирует этот сервер поверх
// фикстуры, чтобы тесты экрана проверяли поведение сквозь тот же контракт,
// каким его видит компонент: applications/totalCount/statusCounts как
// функция от переданного фильтра, а не готовый массив).
let overviewFixture: Application[] = [];
let overviewLoading = false;
let overviewError: Error | null = null;
const overviewRefetch = vi.fn();

type MockFilters = {
  statuses?: Set<ApplicationState>;
  nominationIds?: Set<string>;
  needsEquipment?: boolean;
  search?: string;
  page: number;
  pageSize: number;
};

function simulateServerOverview(all: Application[], filters: MockFilters) {
  const statuses = filters.statuses ?? new Set<ApplicationState>();
  const nominationIds = filters.nominationIds ?? new Set<string>();
  const needsEquipment = filters.needsEquipment ?? false;
  const q = (filters.search ?? "").trim().toLowerCase();

  const filtered = all.filter((a) => {
    if (statuses.size > 0 && !statuses.has(a.state)) return false;
    if (nominationIds.size > 0 && !nominationIds.has(a.nominationId)) return false;
    if (needsEquipment && !a.needsEquipment) return false;
    if (q !== "" && !a.applicantDisplayName.toLowerCase().includes(q) && !a.club.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  const start = (filters.page - 1) * filters.pageSize;
  const applications = filtered.slice(start, start + filters.pageSize);

  // statusCounts — по ВСЕМУ списку, не зависит от фильтра/поиска (FR-4/AC-2).
  const countsMap = new Map<ApplicationState, number>();
  for (const a of all) countsMap.set(a.state, (countsMap.get(a.state) ?? 0) + 1);
  const statusCounts = Array.from(countsMap.entries()).map(([status, count]) => ({ status, count }));

  return { applications, totalCount: filtered.length, statusCounts };
}

vi.mock("../api/use-applications-overview", () => ({
  useApplicationsOverview: (_tournamentId: string, filters: MockFilters) => {
    if (overviewError) {
      return {
        applications: [],
        totalCount: 0,
        statusCounts: [],
        isLoading: false,
        error: overviewError,
        refetch: overviewRefetch,
      };
    }
    if (overviewLoading) {
      return {
        applications: [],
        totalCount: 0,
        statusCounts: [],
        isLoading: true,
        error: null,
        refetch: overviewRefetch,
      };
    }
    const result = simulateServerOverview(overviewFixture, filters);
    return { ...result, isLoading: false, error: null, refetch: overviewRefetch };
  },
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
  useConfirmPayment: () => ({ mutate: confirmMutate, isPending: false, variables: undefined }),
}));
vi.mock("../api/use-register-fighter", () => ({
  useRegisterFighter: () => ({ mutate: registerMutate, isPending: false, variables: undefined }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  overviewFixture = [];
  overviewLoading = false;
  overviewError = null;
  confirmResult = { ok: true };
  registerResult = { ok: true, capacityExceeded: false };
});

function rowLabels(): string[] {
  return Array.from(document.querySelectorAll('[data-slot="application-row"]')).map(
    (el) => el.querySelector(".font-medium")?.textContent ?? "",
  );
}

describe("ApplicationsScreen", () => {
  it("shows the queue in deterministic order: secretary-pending first, then applicant-pending, then terminal (AC-1)", () => {
    overviewFixture = [
      app({ id: "reg", applicantDisplayName: "Терминальный", state: "APPLICATION_STATE_REGISTERED" }),
      app({ id: "sub", applicantDisplayName: "Ждём бойца", state: "APPLICATION_STATE_SUBMITTED" }),
      app({ id: "paid", applicantDisplayName: "Оплачена", state: "APPLICATION_STATE_PAID" }),
      app({ id: "await", applicantDisplayName: "Ждёт секретаря", state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" }),
    ];

    render(<ApplicationsScreen tournamentId="t1" nominations={[nomination({})]} />);

    expect(rowLabels()).toEqual(["Ждёт секретаря", "Оплачена", "Ждём бойца", "Терминальный"]);
  });

  it("keeps status-chip counts independent of the search query (AC-2)", () => {
    overviewFixture = [
      ...Array.from({ length: 31 }, (_, i) => app({ id: `s${i}`, state: "APPLICATION_STATE_SUBMITTED" })),
      ...Array.from({ length: 6 }, (_, i) =>
        app({ id: `w${i}`, state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" }),
      ),
      ...Array.from({ length: 124 }, (_, i) =>
        app({ id: `r${i}`, applicantDisplayName: `Uniq ${i}`, state: "APPLICATION_STATE_REGISTERED" }),
      ),
    ];

    render(<ApplicationsScreen tournamentId="t1" nominations={[nomination({})]} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Uniq 3" } });

    expect(screen.getByRole("button", { name: /Подана/ })).toHaveTextContent("31");
    expect(screen.getByRole("button", { name: /Ожидает подтверждения/ })).toHaveTextContent("6");
    expect(screen.getByRole("button", { name: /Зарегистрирована/ })).toHaveTextContent("124");
  });

  it("supports multi-select of statuses (AC-3)", () => {
    overviewFixture = [
      app({ id: "a", applicantDisplayName: "Первый", state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" }),
      app({ id: "b", applicantDisplayName: "Второй", state: "APPLICATION_STATE_PAID" }),
      app({ id: "c", applicantDisplayName: "Третий", state: "APPLICATION_STATE_SUBMITTED" }),
    ];

    render(<ApplicationsScreen tournamentId="t1" nominations={[nomination({})]} />);

    fireEvent.click(screen.getByRole("button", { name: /^Ожидает подтверждения/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Оплачена/ }));

    expect(screen.getByText("Первый")).toBeInTheDocument();
    expect(screen.getByText("Второй")).toBeInTheDocument();
    expect(screen.queryByText("Третий")).not.toBeInTheDocument();
  });

  it("preselects the nomination filter and combines multiple selections (AC-4)", () => {
    const nominations = [nomination({ id: "n1", title: "Лонгсворд" }), nomination({ id: "n2", title: "Сабля" })];
    overviewFixture = [
      app({ id: "a", nominationId: "n1", applicantDisplayName: "Из Лонгсворда" }),
      app({ id: "b", nominationId: "n2", applicantDisplayName: "Из Сабли" }),
    ];

    render(<ApplicationsScreen tournamentId="t1" nominations={nominations} initialNominationId="n1" />);

    expect(screen.getByRole("button", { name: "Лонгсворд" })).toBeInTheDocument();
    expect(screen.getByText("Из Лонгсворда")).toBeInTheDocument();
    expect(screen.queryByText("Из Сабли")).not.toBeInTheDocument();

    // Radix DropdownMenuTrigger не открывается по jsdom-эмуляции click (нет
    // реальных pointer-событий) — открываем клавиатурой, как это делает
    // реальная a11y-навигация.
    fireEvent.keyDown(screen.getByRole("button", { name: "Лонгсворд" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Сабля" }));

    expect(screen.getByText("2 номинации")).toBeInTheDocument();
    expect(screen.getByText("Из Лонгсворда")).toBeInTheDocument();
    expect(screen.getByText("Из Сабли")).toBeInTheDocument();
  });

  it("combines equipment filter and search (AC-5)", () => {
    overviewFixture = [
      app({ id: "a", applicantDisplayName: "С экипировкой", club: "Клинок", needsEquipment: true, state: "APPLICATION_STATE_PAID" }),
      app({ id: "b", applicantDisplayName: "Без экипировки", club: "Клинок", needsEquipment: false, state: "APPLICATION_STATE_PAID" }),
    ];

    render(<ApplicationsScreen tournamentId="t1" nominations={[nomination({})]} />);

    fireEvent.click(screen.getByRole("button", { name: "Нужна экипировка" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "клинок" } });

    expect(screen.getByText("С экипировкой")).toBeInTheDocument();
    expect(screen.queryByText("Без экипировки")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    expect(screen.getByText("Без экипировки")).toBeInTheDocument();
  });

  it("confirming payment shows a success toast (AC-6)", () => {
    overviewFixture = [app({ id: "a1", state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" })];

    render(<ApplicationsScreen tournamentId="t1" nominations={[nomination({})]} />);

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить оплату" }));

    expect(confirmMutate).toHaveBeenCalledWith("a1", expect.anything());
    expect(toastSuccess).toHaveBeenCalledWith("Оплата подтверждена");
  });

  it("registering an overfull-nomination application warns beforehand and confirms with the warning in the toast (AC-7)", () => {
    registerResult = { ok: true, capacityExceeded: true };
    overviewFixture = [
      app({ id: "a1", nominationId: "n1", state: "APPLICATION_STATE_PAID" }),
      app({ id: "reg1", nominationId: "n1", state: "APPLICATION_STATE_REGISTERED", applicantDisplayName: "Другой" }),
    ];

    render(
      <ApplicationsScreen
        tournamentId="t1"
        nominations={[nomination({ id: "n1", fighterCapacity: 1 })]}
      />,
    );

    expect(screen.getAllByText("номинация переполнена").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Зарегистрировать" }));

    expect(registerMutate).toHaveBeenCalledWith("a1", expect.anything());
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/переполнена/),
    );
  });

  it("a rejected action shows a toastError without a retry action (AC-8)", () => {
    confirmResult = { ok: false, error: "Нельзя подтвердить оплату" };
    overviewFixture = [app({ id: "a1", state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" })];

    render(<ApplicationsScreen tournamentId="t1" nominations={[nomination({})]} />);

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить оплату" }));

    expect(toastError).toHaveBeenCalledTimes(1);
    const [message, options] = toastError.mock.calls[0] as [string, { retry?: () => void } | undefined];
    expect(message).toBe("Нельзя подтвердить оплату");
    expect(options?.retry).toBeUndefined();
  });

  it("fills the section header: crumb with tournament name, title, and a count (AC-13)", () => {
    overviewFixture = Array.from({ length: 187 }, (_, i) => app({ id: `a${i}`, applicantDisplayName: `Заявитель ${i}` }));
    const nominations = Array.from({ length: 5 }, (_, i) => nomination({ id: `n${i}`, title: `Ном ${i}` }));

    render(
      <ApplicationsScreen
        tournamentId="t1"
        nominations={nominations}
        tournamentName="Клинок Севера 2026"
      />,
    );

    const header = document.querySelector('[data-slot="page-header"]') as HTMLElement;
    expect(within(header).getByText("ЗАЯВКИ · КЛИНОК СЕВЕРА 2026")).toBeInTheDocument();
    expect(within(header).getByText("Заявки")).toBeInTheDocument();
    expect(within(header).getByText("187 заявок · 5 номинаций")).toBeInTheDocument();
  });

  it("shows only 'ЗАЯВКИ' in the crumb without an active tournament (AC-13)", () => {
    render(<ApplicationsScreen tournamentId="t1" nominations={[]} />);
    expect(screen.getByText("ЗАЯВКИ")).toBeInTheDocument();
  });

  it("shows loading skeleton, retryable error, and distinct empty states (AC-14)", () => {
    overviewLoading = true;
    const { unmount } = render(<ApplicationsScreen tournamentId="t1" nominations={[]} />);
    expect(document.querySelectorAll('[data-slot="skeleton-row"]').length).toBeGreaterThan(0);
    unmount();

    overviewLoading = false;
    overviewError = new Error("Сеть недоступна");
    const { unmount: unmount2 } = render(<ApplicationsScreen tournamentId="t1" nominations={[]} />);
    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(overviewRefetch).toHaveBeenCalledTimes(1);
    unmount2();

    overviewError = null;
    overviewFixture = [];
    const { unmount: unmount3 } = render(<ApplicationsScreen tournamentId="t1" nominations={[]} />);
    expect(screen.getByText("Заявок в турнире нет")).toBeInTheDocument();
    unmount3();

    overviewFixture = [app({ id: "a1", applicantDisplayName: "Единственный" })];
    render(<ApplicationsScreen tournamentId="t1" nominations={[]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "нет такого" } });
    expect(screen.getByText("По выбранным фильтрам ничего не найдено")).toBeInTheDocument();
  });

  it("resets pagination to page 1 when a filter changes (AC-15)", () => {
    overviewFixture = Array.from({ length: PAGE_SIZE + 3 }, (_, i) =>
      app({
        id: `a${i}`,
        applicantDisplayName: `Заявитель ${String(i + 1).padStart(2, "0")}`,
        state: "APPLICATION_STATE_SUBMITTED",
      }),
    );

    render(<ApplicationsScreen tournamentId="t1" nominations={[nomination({})]} />);

    expect(screen.getByText("Заявитель 01")).toBeInTheDocument();
    expect(screen.queryByText(`Заявитель ${PAGE_SIZE + 1}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByText(`Заявитель ${PAGE_SIZE + 1}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Подана/ }));

    expect(screen.getByText("Заявитель 01")).toBeInTheDocument();
    expect(screen.queryByText(`Заявитель ${PAGE_SIZE + 1}`)).not.toBeInTheDocument();
  });
});
