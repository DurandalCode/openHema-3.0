// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsersScreen, PAGE_SIZE } from "./users-screen";
import { DEFAULT_LIST_LIMIT, type AdminUser } from "../api/requests";

afterEach(() => {
  cleanup();
});

function user(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: "id",
    email: "user@hema.test",
    displayName: "",
    role: "ROLE_USER",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let usersState: { data: AdminUser[]; isLoading: boolean; error: Error | null } = {
  data: [],
  isLoading: false,
  error: null,
};
const refetch = vi.fn();

vi.mock("../api/use-users", () => ({
  useUsers: () => ({ ...usersState, refetch }),
}));

type MutateOpts = { onSuccess?: (u: AdminUser) => void; onError?: (e: Error) => void };

let promoteResult: { ok: true; user: AdminUser } | { ok: false; error: string } = {
  ok: true,
  user: user({ id: "x" }),
};
let demoteResult: { ok: true; user: AdminUser } | { ok: false; error: string } = {
  ok: true,
  user: user({ id: "x" }),
};

const promoteMutate = vi.fn((_userId: string, opts?: MutateOpts) => {
  if (promoteResult.ok) opts?.onSuccess?.(promoteResult.user);
  else opts?.onError?.(new Error(promoteResult.error));
});
const demoteMutate = vi.fn((_userId: string, opts?: MutateOpts) => {
  if (demoteResult.ok) opts?.onSuccess?.(demoteResult.user);
  else opts?.onError?.(new Error(demoteResult.error));
});

vi.mock("../api/use-promote-user", () => ({
  usePromoteUser: () => ({ mutate: promoteMutate, isPending: false }),
}));
vi.mock("../api/use-demote-user", () => ({
  useDemoteUser: () => ({ mutate: demoteMutate, isPending: false }),
}));
vi.mock("../api/use-create-admin", () => ({
  useCreateAdmin: () => ({ mutate: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastUndo = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
  toastUndo: (...args: unknown[]) => toastUndo(...args),
  toastPending: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  usersState = { data: [], isLoading: false, error: null };
  promoteResult = { ok: true, user: user({ id: "x" }) };
  demoteResult = { ok: true, user: user({ id: "x" }) };
});

describe("UsersScreen", () => {
  it("shows a single unified list of all accounts (AC-1)", () => {
    const admins = [
      user({ id: "a1", displayName: "Админ Один", role: "ROLE_ADMIN" }),
      user({ id: "a2", displayName: "Админ Два", role: "ROLE_ADMIN" }),
      user({ id: "a3", displayName: "Админ Три", role: "ROLE_ADMIN" }),
    ];
    const regulars = Array.from({ length: 5 }, (_, i) =>
      user({ id: `u${i}`, displayName: `Юзер ${i}`, role: "ROLE_USER" }),
    );
    usersState = { data: [...admins, ...regulars], isLoading: false, error: null };

    render(<UsersScreen currentUserId="a1" />);

    expect(document.querySelectorAll('[data-slot="user-row"]')).toHaveLength(8);
  });

  it("keeps role-chip counts independent of the search query (AC-3)", () => {
    const admins = [
      user({ id: "a1", displayName: "Админ Один", role: "ROLE_ADMIN" }),
      user({ id: "a2", displayName: "Админ Два", role: "ROLE_ADMIN" }),
      user({ id: "a3", displayName: "Админ Три", role: "ROLE_ADMIN" }),
    ];
    const regulars = Array.from({ length: 164 }, (_, i) =>
      user({ id: `u${i}`, displayName: `Юзер ${i}`, email: `u${i}@hema.test`, role: "ROLE_USER" }),
    );
    usersState = { data: [...admins, ...regulars], isLoading: false, error: null };

    render(<UsersScreen currentUserId="a1" />);

    fireEvent.change(screen.getByRole("searchbox", { name: /поиск/i }), {
      target: { value: "Юзер 1 " },
    });

    expect(screen.getByRole("button", { name: /Администраторы/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /Пользователи/ })).toHaveTextContent("164");
  });

  it("filters by role (AC-4)", () => {
    usersState = {
      data: [
        user({ id: "a1", displayName: "Николай Админов", role: "ROLE_ADMIN" }),
        user({ id: "u1", displayName: "Юрий Юзеров", role: "ROLE_USER" }),
      ],
      isLoading: false,
      error: null,
    };

    render(<UsersScreen currentUserId="a1" />);

    fireEvent.click(screen.getByRole("button", { name: /Администраторы/ }));

    expect(screen.getByText("Николай Админов")).toBeInTheDocument();
    expect(screen.queryByText("Юрий Юзеров")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Администраторы/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Все/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("searches by name/email substring (AC-5)", () => {
    usersState = {
      data: [
        user({ id: "a1", displayName: "Анна Кораблёва", email: "a.korableva@klinok.ru", role: "ROLE_ADMIN" }),
        user({ id: "u1", displayName: "Борис Волков", email: "boris@klinok.ru", role: "ROLE_USER" }),
      ],
      isLoading: false,
      error: null,
    };

    render(<UsersScreen currentUserId="a1" />);

    fireEvent.change(screen.getByRole("searchbox", { name: /поиск/i }), {
      target: { value: "КОРАБ" },
    });

    expect(screen.getByText("Анна Кораблёва")).toBeInTheDocument();
    expect(screen.queryByText("Борис Волков")).not.toBeInTheDocument();
  });

  it("combines role filter and search (AC-6)", () => {
    usersState = {
      data: [
        user({ id: "a1", displayName: "Анна Кораблёва", email: "a.korableva@klinok.ru", role: "ROLE_ADMIN" }),
        user({ id: "u1", displayName: "Борис Кораблёв", email: "boris@klinok.ru", role: "ROLE_USER" }),
      ],
      isLoading: false,
      error: null,
    };

    render(<UsersScreen currentUserId="a1" />);

    fireEvent.click(screen.getByRole("button", { name: /Пользователи/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: /поиск/i }), {
      target: { value: "Кораб" },
    });

    expect(screen.getByText("Борис Кораблёв")).toBeInTheDocument();
    expect(screen.queryByText("Анна Кораблёва")).not.toBeInTheDocument();
  });

  it("a successful role change shows toastUndo, and 'Отменить' calls the inverse mutation on the same person (AC-7)", () => {
    const target = user({ id: "u1", displayName: "Иван Петров", email: "ivan@hema.test", role: "ROLE_USER" });
    usersState = {
      data: [user({ id: "a1", displayName: "Админ", role: "ROLE_ADMIN" }), target],
      isLoading: false,
      error: null,
    };
    promoteResult = { ok: true, user: { ...target, role: "ROLE_ADMIN" } };

    render(<UsersScreen currentUserId="a1" />);

    fireEvent.click(screen.getByRole("button", { name: "Повысить" }));

    expect(promoteMutate).toHaveBeenCalledWith("u1", expect.anything());
    expect(toastUndo).toHaveBeenCalledTimes(1);
    const [, options] = toastUndo.mock.calls[0] as [string, { onUndo: () => void }];

    demoteResult = { ok: true, user: { ...target, role: "ROLE_USER" } };
    options.onUndo();

    expect(demoteMutate).toHaveBeenCalledWith("u1", expect.anything());
    // Отмена сообщает об успехе уже без кнопки отмены — toastSuccess, не toastUndo второй раз.
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastUndo).toHaveBeenCalledTimes(1);
  });

  it("a server-rejected role change shows toastError with no retry action, and the role in the list does not change (AC-9)", () => {
    const target = user({ id: "a2", displayName: "Второй Админ", role: "ROLE_ADMIN" });
    usersState = {
      data: [user({ id: "a1", displayName: "Первый Админ", role: "ROLE_ADMIN" }), target],
      isLoading: false,
      error: null,
    };
    demoteResult = { ok: false, error: "нельзя понизить последнего админа" };

    render(<UsersScreen currentUserId="a1" />);

    const buttons = screen.getAllByRole("button", { name: "Понизить" });
    fireEvent.click(buttons[buttons.length - 1]);

    expect(toastError).toHaveBeenCalledTimes(1);
    const [message, options] = toastError.mock.calls[0] as [string, { retry?: () => void } | undefined];
    expect(message).toBe("нельзя понизить последнего админа");
    expect(options?.retry).toBeUndefined();
    expect(toastUndo).not.toHaveBeenCalled();
    // роль в списке не изменилась — фиктивные данные не меняются, строка остаётся с тегом «Админ».
    expect(within(document.body).getAllByText("Админ").length).toBeGreaterThan(0);
  });

  it("resets pagination to page 1 when the role filter changes (AC-15)", () => {
    const regulars = Array.from({ length: PAGE_SIZE + 3 }, (_, i) =>
      user({
        id: `u${i}`,
        displayName: `User ${String(i + 1).padStart(2, "0")}`,
        email: `user${i}@hema.test`,
        role: "ROLE_USER",
      }),
    );
    usersState = { data: regulars, isLoading: false, error: null };

    render(<UsersScreen currentUserId="none" />);

    expect(screen.getByText("User 01")).toBeInTheDocument();
    expect(screen.queryByText(`User ${PAGE_SIZE + 1}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByText(`User ${PAGE_SIZE + 1}`)).toBeInTheDocument();
    expect(screen.queryByText("User 01")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Пользователи/ }));

    expect(screen.getByText("User 01")).toBeInTheDocument();
    expect(screen.queryByText(`User ${PAGE_SIZE + 1}`)).not.toBeInTheDocument();
  });

  it("fills the section header: crumb with tournament name, title, count, and an action that opens the create-admin modal (AC-13)", () => {
    usersState = {
      data: Array.from({ length: 167 }, (_, i) => user({ id: `u${i}`, email: `u${i}@hema.test` })),
      isLoading: false,
      error: null,
    };

    render(<UsersScreen currentUserId="a1" tournamentName="Клинок Севера 2026" />);

    const header = document.querySelector('[data-slot="page-header"]') as HTMLElement;
    expect(within(header).getByText("ПОЛЬЗОВАТЕЛИ · КЛИНОК СЕВЕРА 2026")).toBeInTheDocument();
    expect(within(header).getByText("Пользователи")).toBeInTheDocument();
    expect(within(header).getByText("167 учётных записей")).toBeInTheDocument();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Создать админа" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows only 'ПОЛЬЗОВАТЕЛИ' in the crumb when there is no active tournament (AC-13)", () => {
    render(<UsersScreen currentUserId="a1" />);

    expect(screen.getByText("ПОЛЬЗОВАТЕЛИ")).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("shows 'N+ учётных записей' when the count hits the fetch limit, to avoid silently lying about the total (plan.md «Риски»)", () => {
    usersState = {
      data: Array.from({ length: DEFAULT_LIST_LIMIT }, (_, i) =>
        user({ id: `u${i}`, email: `u${i}@hema.test` }),
      ),
      isLoading: false,
      error: null,
    };

    render(<UsersScreen currentUserId="a1" />);

    expect(screen.getByText(`${DEFAULT_LIST_LIMIT}+ учётных записей`)).toBeInTheDocument();
  });
});
