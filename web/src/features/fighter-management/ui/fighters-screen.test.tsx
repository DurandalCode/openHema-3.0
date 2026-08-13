// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fighter } from "@/entities/fighter/lib/types";
import type { Nomination } from "@/entities/nomination/lib/types";
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

let rosterState: { data: Fighter[]; isLoading: boolean; error: Error | null } = {
  data: [],
  isLoading: false,
  error: null,
};
const rosterRefetch = vi.fn();

vi.mock("../api/use-roster", () => ({
  useRoster: () => ({ ...rosterState, refetch: rosterRefetch }),
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
const createMutate = vi.fn();

vi.mock("../api/use-fighter-mutations", () => ({
  useEditFighter: () => ({ mutate: editMutate, isPending: false }),
  useWithdrawFighter: () => ({ mutate: withdrawMutate, isPending: false }),
  useReturnFighter: () => ({ mutate: returnMutate, isPending: false }),
  useAddToNomination: () => ({ mutate: addMutate, isPending: false }),
  useRemoveFromNomination: () => ({ mutate: removeMutate, isPending: false }),
  useMoveFighter: () => ({ mutate: moveMutate, isPending: false }),
  useCreateFighter: () => ({ mutate: createMutate, isPending: false, error: null, reset: vi.fn() }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  rosterState = { data: [], isLoading: false, error: null };
  returnResult = { ok: true };
});

function rowNames(): string[] {
  return Array.from(document.querySelectorAll('[data-slot="table-row"]')).map(
    (el) => el.querySelector("span")?.textContent ?? "",
  );
}

describe("FightersScreen", () => {
  it("shows the roster in deterministic order: active first, then withdrawn, by name within group (AC-1)", () => {
    rosterState = {
      data: [
        fighter({ id: "w", name: "Юлия Выбывшая", status: "FIGHTER_STATUS_WITHDRAWN" }),
        fighter({ id: "b", name: "Борис" }),
        fighter({ id: "a", name: "Анна" }),
      ],
      isLoading: false,
      error: null,
    };

    render(<FightersScreen tournamentId="t1" nominations={[nomination({})]} />);

    expect(rowNames()).toEqual(["Анна", "Борис", "Юлия Выбывшая"]);
  });

  it("keeps status-chip counts independent of the search query (AC-2)", () => {
    rosterState = {
      data: [
        ...Array.from({ length: 159 }, (_, i) => fighter({ id: `a${i}`, name: `Активный ${i}` })),
        ...Array.from({ length: 5 }, (_, i) =>
          fighter({ id: `w${i}`, name: `Выбывший ${i}`, status: "FIGHTER_STATUS_WITHDRAWN" }),
        ),
      ],
      isLoading: false,
      error: null,
    };

    render(<FightersScreen tournamentId="t1" nominations={[nomination({})]} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Активный 3" } });

    expect(screen.getByRole("button", { name: /Активные/ })).toHaveTextContent("159");
    expect(screen.getByRole("button", { name: /Выбыли/ })).toHaveTextContent("5");
  });

  it("combines status/club/nomination filters together (AC-3)", () => {
    rosterState = {
      data: [
        fighter({
          id: "a",
          name: "Первый",
          club: "Ганза",
          participations: [{ nominationId: "n1", status: "PARTICIPATION_STATUS_ACTIVE" }],
        }),
        fighter({ id: "b", name: "Второй", club: "Ганза", participations: [] }),
        fighter({
          id: "c",
          name: "Третий",
          club: "Другой клуб",
          participations: [{ nominationId: "n1", status: "PARTICIPATION_STATUS_ACTIVE" }],
        }),
      ],
      isLoading: false,
      error: null,
    };

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

    expect(screen.getByText("Первый")).toBeInTheDocument();
    expect(screen.queryByText("Второй")).not.toBeInTheDocument();
    expect(screen.queryByText("Третий")).not.toBeInTheDocument();
  });

  it("shows a server error toast without a retry action when a card action fails (AC-12)", () => {
    returnResult = { ok: false, error: "Нельзя вернуть бойца" };
    rosterState = {
      data: [fighter({ id: "f1", status: "FIGHTER_STATUS_WITHDRAWN" })],
      isLoading: false,
      error: null,
    };

    render(<FightersScreen tournamentId="t1" nominations={[nomination({})]} />);

    fireEvent.click(screen.getByText("Иван Петров"));
    fireEvent.click(screen.getByRole("button", { name: "Вернуть на турнир" }));

    expect(toastError).toHaveBeenCalledTimes(1);
    const [message, options] = toastError.mock.calls[0] as [string, { retry?: () => void } | undefined];
    expect(message).toBe("Нельзя вернуть бойца");
    expect(options?.retry).toBeUndefined();
  });

  it("fills the section header: crumb with tournament name, title, and a count (AC-15)", () => {
    rosterState = {
      data: Array.from({ length: 164 }, (_, i) => fighter({ id: `f${i}`, name: `Боец ${i}` })),
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

  it("shows only 'БОЙЦЫ' in the crumb without an active tournament", () => {
    render(<FightersScreen tournamentId="t1" nominations={[]} />);
    expect(screen.getByText("БОЙЦЫ")).toBeInTheDocument();
  });

  it("shows loading skeleton, retryable error, and distinct empty states (AC-16)", () => {
    rosterState = { data: [], isLoading: true, error: null };
    const { unmount } = render(<FightersScreen tournamentId="t1" nominations={[]} />);
    expect(document.querySelectorAll('[data-slot="skeleton-row"]').length).toBeGreaterThan(0);
    unmount();

    rosterState = { data: [], isLoading: false, error: new Error("Сеть недоступна") };
    const { unmount: unmount2 } = render(<FightersScreen tournamentId="t1" nominations={[]} />);
    expect(screen.getByText("Сеть недоступна")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(rosterRefetch).toHaveBeenCalledTimes(1);
    unmount2();

    rosterState = { data: [], isLoading: false, error: null };
    const { unmount: unmount3 } = render(<FightersScreen tournamentId="t1" nominations={[]} />);
    expect(screen.getByText("В ростере пока нет бойцов")).toBeInTheDocument();
    unmount3();

    rosterState = { data: [fighter({ id: "f1", name: "Единственный" })], isLoading: false, error: null };
    render(<FightersScreen tournamentId="t1" nominations={[]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "нет такого" } });
    expect(screen.getByText("По выбранным фильтрам никого не найдено")).toBeInTheDocument();
  });

  it("resets pagination to page 1 when a filter changes (AC-17)", () => {
    rosterState = {
      data: Array.from({ length: PAGE_SIZE + 3 }, (_, i) =>
        fighter({ id: `f${i}`, name: `Боец ${String(i + 1).padStart(2, "0")}` }),
      ),
      isLoading: false,
      error: null,
    };

    render(<FightersScreen tournamentId="t1" nominations={[nomination({})]} />);

    expect(screen.getByText("Боец 01")).toBeInTheDocument();
    expect(screen.queryByText(`Боец ${PAGE_SIZE + 1}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByText(`Боец ${PAGE_SIZE + 1}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Активные/ }));

    expect(screen.getByText("Боец 01")).toBeInTheDocument();
    expect(screen.queryByText(`Боец ${PAGE_SIZE + 1}`)).not.toBeInTheDocument();
  });
});
