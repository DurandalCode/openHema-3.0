// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fighter } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
import type { RosterListQuery } from "../api/requests";
import type { StatusCounts } from "../lib/select-fighters";
import { FightersScreen, PAGE_SIZE } from "./fighters-screen";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  if (!("ResizeObserver" in window)) {
    // @ts-expect-error - минимальный polyfill для jsdom
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

function fighter(overrides: Partial<Fighter>): Fighter {
  return {
    id: "f1",
    tournamentId: "t1",
    name: "Иван Петров",
    club: "Клинок Севера",
    status: "FIGHTER_STATUS_ACTIVE",
    withdrawalReason: "WITHDRAWAL_REASON_UNSPECIFIED",
    participations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fromApplication: true,
    linkedAccountId: "",
    linkedAccountDisplayName: "",
    mergedIntoId: "",
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

// useRoster — постраничная выборка под фильтр (спека 0041, T20-T23): мок
// возвращает `rosterState` как есть (фильтрация/поиск/постраничность
// реально выполняются на сервере, не в этом компоненте — покрыты
// серверными/BFF-тестами). `useRosterSpy` ловит query-аргументы вызова, тем
// самым тесты проверяют, ЧТО экран запрашивает у сервера при смене фильтра
// (AC-3/AC-17), а не то, что он сам фильтрует/листает массив.
type RosterData = { fighters: Fighter[]; totalCount: number; statusCounts: StatusCounts };
let rosterState: { data: RosterData | undefined; isLoading: boolean; error: Error | null } = {
  data: { fighters: [], totalCount: 0, statusCounts: { active: 0, withdrawn: 0 } },
  isLoading: false,
  error: null,
};
const rosterRefetch = vi.fn();
const useRosterSpy = vi.fn();
let useRosterImpl = (_tournamentId: string, _query: RosterListQuery) => ({
  ...rosterState,
  refetch: rosterRefetch,
});

vi.mock("../api/use-roster", () => ({
  useRoster: (tournamentId: string, query: RosterListQuery) => {
    useRosterSpy(tournamentId, query);
    return useRosterImpl(tournamentId, query);
  },
}));

// useFullRoster — весь ростер без фильтра (план «Риски»): источник
// выпадающего списка клубов, счётчика в шапке и данных для
// FighterCardDialog/MergeFightersDialog (см. fighters-screen.tsx).
let fullRosterState: Fighter[] = [];
vi.mock("../api/use-full-roster", () => ({
  useFullRoster: () => ({ data: fullRosterState, isLoading: false, error: null }),
}));

type MutateOpts<T = unknown> = { onSuccess?: (r?: T) => void; onError?: (e: Error) => void };

let returnResult: { ok: true } | { ok: false; error: string } = { ok: true };
const returnMutate = vi.fn((_id: string, opts?: MutateOpts) => {
  if (returnResult.ok) opts?.onSuccess?.();
  else opts?.onError?.(new Error(returnResult.error));
});
const editMutate = vi.fn((_args: unknown, opts?: MutateOpts) => opts?.onSuccess?.());
const withdrawMutate = vi.fn((_args: unknown, opts?: MutateOpts) => opts?.onSuccess?.());
const addMutate = vi.fn((_args: unknown, opts?: MutateOpts) => opts?.onSuccess?.());
const removeMutate = vi.fn((_args: unknown, opts?: MutateOpts) => opts?.onSuccess?.());
const moveMutate = vi.fn((_args: unknown, opts?: MutateOpts) => opts?.onSuccess?.());
const mergeMutate = vi.fn((_args: unknown, opts?: MutateOpts) => opts?.onSuccess?.());
const createMutate = vi.fn();

vi.mock("../api/use-fighter-mutations", () => ({
  useEditFighter: () => ({ mutate: editMutate, isPending: false }),
  useWithdrawFighter: () => ({ mutate: withdrawMutate, isPending: false }),
  useReturnFighter: () => ({ mutate: returnMutate, isPending: false }),
  useAddToNomination: () => ({ mutate: addMutate, isPending: false }),
  useRemoveFromNomination: () => ({ mutate: removeMutate, isPending: false }),
  useMoveFighter: () => ({ mutate: moveMutate, isPending: false }),
  useMergeFighters: () => ({ mutate: mergeMutate, isPending: false }),
  useCreateFighter: () => ({ mutate: createMutate, isPending: false, error: null, reset: vi.fn() }),
}));

// Импорт ростера из файла (спека 0049): у экрана своя мутация, не входящая
// в use-fighter-mutations — мокается отдельно, иначе настоящий хук требует
// QueryClientProvider.
const importMutate = vi.fn();
vi.mock("../api/use-import-fighters", () => ({
  useImportFighters: () => ({ mutate: importMutate, isPending: false, reset: vi.fn() }),
}));

vi.mock("../api/return-outcome", () => ({
  resolveReturnSeeding: vi.fn().mockResolvedValue(null),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  rosterState = { data: { fighters: [], totalCount: 0, statusCounts: { active: 0, withdrawn: 0 } }, isLoading: false, error: null };
  useRosterImpl = (_tournamentId, _query) => ({ ...rosterState, refetch: rosterRefetch });
  fullRosterState = [];
  returnResult = { ok: true };
});

function rowNames(): string[] {
  return Array.from(document.querySelectorAll('[data-slot="table-row"]')).map(
    (el) => el.querySelector("span")?.textContent ?? "",
  );
}

function lastRosterQuery(): RosterListQuery {
  const calls = useRosterSpy.mock.calls;
  const [, query] = calls[calls.length - 1] as [string, RosterListQuery];
  return query;
}

describe("FightersScreen", () => {
  it("shows the roster page in deterministic order: active first, then withdrawn, by name within group (AC-1)", () => {
    rosterState = {
      data: {
        fighters: [
          fighter({ id: "w", name: "Юлия Выбывшая", status: "FIGHTER_STATUS_WITHDRAWN" }),
          fighter({ id: "b", name: "Борис" }),
          fighter({ id: "a", name: "Анна" }),
        ],
        totalCount: 3,
        statusCounts: { active: 2, withdrawn: 1 },
      },
      isLoading: false,
      error: null,
    };

    render(<FightersScreen tournamentId="t1" nominations={[nomination({})]} />);

    expect(rowNames()).toEqual(["Анна", "Борис", "Юлия Выбывшая"]);
  });

  it("keeps status-chip counts independent of the search query (AC-2)", () => {
    rosterState = {
      data: {
        fighters: [fighter({ id: "a0", name: "Активный 0" })],
        totalCount: 164,
        statusCounts: { active: 159, withdrawn: 5 },
      },
      isLoading: false,
      error: null,
    };

    render(<FightersScreen tournamentId="t1" nominations={[nomination({})]} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Активный 3" } });

    expect(screen.getByRole("button", { name: /Активные/ })).toHaveTextContent("159");
    expect(screen.getByRole("button", { name: /Выбыли/ })).toHaveTextContent("5");
  });

  it("requests the server with the combined status/club/nomination filter (AC-3/AC-4)", () => {
    fullRosterState = [fighter({ id: "1", club: "Ганза" }), fighter({ id: "2", club: "Другой клуб" })];

    render(
      <FightersScreen
        tournamentId="t1"
        nominations={[nomination({ id: "n1", title: "Лонгсворд" })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Активные/ }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Все клубы" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Ганза" }));
    // Множественный выбор держит меню открытым (onSelect preventDefault) —
    // закрываем явно, иначе Radix прячет остальной документ через aria-hidden
    // (DismissableLayer) и следующий getByRole не найдёт соседний триггер.
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Все номинации" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Лонгсворд" }));

    const query = lastRosterQuery();
    expect(query.statuses).toEqual(["FIGHTER_STATUS_ACTIVE"]);
    expect(query.clubs).toEqual(["Ганза"]);
    expect(query.nominationIds).toEqual(["n1"]);
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(PAGE_SIZE);
  });

  it("splits the 'no club' filter item into includeNoClub, separate from clubs[] (spec 0026 FR-9)", () => {
    fullRosterState = [fighter({ id: "1", club: "" })];

    render(<FightersScreen tournamentId="t1" nominations={[]} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Все клубы" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Без клуба" }));

    const query = lastRosterQuery();
    expect(query.clubs).toEqual([]);
    expect(query.includeNoClub).toBe(true);
  });

  it("shows a server error toast without a retry action when a card action fails (AC-12)", () => {
    returnResult = { ok: false, error: "Нельзя вернуть бойца" };
    const withdrawn = fighter({ id: "f1", status: "FIGHTER_STATUS_WITHDRAWN" });
    rosterState = {
      data: { fighters: [withdrawn], totalCount: 1, statusCounts: { active: 0, withdrawn: 1 } },
      isLoading: false,
      error: null,
    };
    fullRosterState = [withdrawn];

    render(<FightersScreen tournamentId="t1" nominations={[nomination({})]} />);

    fireEvent.click(screen.getByText("Иван Петров"));
    fireEvent.click(screen.getByRole("button", { name: "Вернуть на турнир" }));

    expect(toastError).toHaveBeenCalledTimes(1);
    const [message, options] = toastError.mock.calls[0] as [string, { retry?: () => void } | undefined];
    expect(message).toBe("Нельзя вернуть бойца");
    expect(options?.retry).toBeUndefined();
  });

  it("fills the section header: crumb with tournament name, title, and a count over the full roster (AC-15)", () => {
    fullRosterState = Array.from({ length: 164 }, (_, i) => fighter({ id: `f${i}`, name: `Боец ${i}` }));
    rosterState = {
      data: {
        fighters: fullRosterState.slice(0, PAGE_SIZE),
        totalCount: 164,
        statusCounts: { active: 164, withdrawn: 0 },
      },
      isLoading: false,
      error: null,
    };
    const nominations = Array.from({ length: 9 }, (_, i) => nomination({ id: `n${i}`, title: `Ном ${i}` }));

    render(
      <FightersScreen tournamentId="t1" nominations={nominations} tournamentName="Клинок Севера 2026" />,
    );

    const header = document.querySelector('[data-slot="page-header"]') as HTMLElement;
    expect(within(header).getByText("БОЙЦЫ · КЛИНОК СЕВЕРА 2026")).toBeInTheDocument();
    expect(within(header).getByText("Бойцы")).toBeInTheDocument();
    expect(within(header).getByText("164 бойца · 9 номинаций")).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: /Боец вручную/ })).toBeInTheDocument();
  });

  it("exports the roster with the current filter as a plain link, not fetch+blob (spec 0041, FR-14/plan «Риски»)", () => {
    render(<FightersScreen tournamentId="t1" nominations={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /^Активные/ }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "иван" } });

    const link = screen.getByRole("link", { name: "Экспорт" });
    const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
    expect(url.pathname).toBe("/api/admin/fighters/export");
    expect(url.searchParams.get("tournamentId")).toBe("t1");
    expect(url.searchParams.getAll("statuses")).toEqual(["FIGHTER_STATUS_ACTIVE"]);
    expect(url.searchParams.get("search")).toBe("иван");
    // FR-14: экспортируется весь отфильтрованный набор, не одна страница.
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.has("pageSize")).toBe(false);
  });

  it("opens the find-by-account dialog from the section header (spec 0040, FR-9)", () => {
    render(<FightersScreen tournamentId="t1" nominations={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Найти по учётке" }));
    expect(screen.getByRole("dialog", { name: /Найти бойца по учётке/ })).toBeInTheDocument();
  });

  it("opens the merge dialog from the section header (spec 0040, FR-10)", () => {
    render(<FightersScreen tournamentId="t1" nominations={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Слить дубли" }));
    expect(screen.getByRole("dialog", { name: /Слить дубли/ })).toBeInTheDocument();
  });

  it("opens the file-import dialog from the section header (spec 0049, FR-1/FR-2)", () => {
    render(<FightersScreen tournamentId="t1" nominations={[nomination({})]} />);

    fireEvent.click(screen.getByRole("button", { name: "Импорт из файла" }));

    const dialog = screen.getByRole("dialog", { name: /Импорт бойцов из файла/ });
    expect(dialog).toBeInTheDocument();
    // Образец файла (FR-11) — прямо в диалоге, admin не должен гадать про колонки.
    expect(within(dialog).getByRole("link", { name: /образец/i })).toHaveAttribute(
      "href",
      "/fighters-import-template.csv",
    );
  });

  it("shows only 'БОЙЦЫ' in the crumb without an active tournament", () => {
    render(<FightersScreen tournamentId="t1" nominations={[]} />);
    expect(screen.getByText("БОЙЦЫ")).toBeInTheDocument();
  });

  it("shows loading skeleton, retryable error, and distinct empty states (AC-16)", () => {
    rosterState = { data: undefined, isLoading: true, error: null };
    const { unmount } = render(<FightersScreen tournamentId="t1" nominations={[]} />);
    expect(document.querySelectorAll('[data-slot="skeleton-row"]').length).toBeGreaterThan(0);
    unmount();

    rosterState = { data: undefined, isLoading: false, error: new Error("Сеть недоступна") };
    const { unmount: unmount2 } = render(<FightersScreen tournamentId="t1" nominations={[]} />);
    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(rosterRefetch).toHaveBeenCalledTimes(1);
    unmount2();

    rosterState = {
      data: { fighters: [], totalCount: 0, statusCounts: { active: 0, withdrawn: 0 } },
      isLoading: false,
      error: null,
    };
    fullRosterState = [];
    const { unmount: unmount3 } = render(<FightersScreen tournamentId="t1" nominations={[]} />);
    expect(screen.getByText("В ростере пока нет бойцов")).toBeInTheDocument();
    unmount3();

    // Ростер турнира не пуст (hasAnyFighters — из useFullRoster), но
    // текущая (мок-)страница под фильтром/поиском пуста — второе пустое
    // состояние (FR-25/AC-16).
    rosterState = {
      data: { fighters: [], totalCount: 0, statusCounts: { active: 1, withdrawn: 0 } },
      isLoading: false,
      error: null,
    };
    fullRosterState = [fighter({ id: "f1", name: "Единственный" })];
    render(<FightersScreen tournamentId="t1" nominations={[]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "нет такого" } });
    expect(screen.getByText("По выбранным фильтрам никого не найдено")).toBeInTheDocument();
  });

  it("resets pagination to page 1 when a filter changes, re-requesting the server (AC-17)", () => {
    const source = Array.from({ length: PAGE_SIZE + 3 }, (_, i) =>
      fighter({ id: `f${i}`, name: `Боец ${String(i + 1).padStart(2, "0")}` }),
    );
    useRosterImpl = (_tournamentId, query) => {
      const offset = (query.page - 1) * query.pageSize;
      return {
        data: {
          fighters: source.slice(offset, offset + query.pageSize),
          totalCount: source.length,
          statusCounts: { active: source.length, withdrawn: 0 },
        },
        isLoading: false,
        error: null,
        refetch: rosterRefetch,
      };
    };

    render(<FightersScreen tournamentId="t1" nominations={[nomination({})]} />);

    expect(screen.getByText("Боец 01")).toBeInTheDocument();
    expect(screen.queryByText(`Боец ${PAGE_SIZE + 1}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByText(`Боец ${PAGE_SIZE + 1}`)).toBeInTheDocument();
    expect(lastRosterQuery().page).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: /^Активные/ }));

    expect(lastRosterQuery().page).toBe(1);
    expect(screen.getByText("Боец 01")).toBeInTheDocument();
    expect(screen.queryByText(`Боец ${PAGE_SIZE + 1}`)).not.toBeInTheDocument();
  });
});
