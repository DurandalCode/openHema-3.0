// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateAdminDialog } from "./create-admin-dialog";

/**
 * Radix `Dialog`/`FocusScope` в jsdom нуждаются в polyfill'ах (см.
 * `shared/ui/dialog.test.tsx`, `features/stage-management/ui/create-stage-dialog.test.tsx`).
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

const createdUser = {
  id: "new-admin",
  email: "new@hema.test",
  displayName: "Новый Админ",
  role: "ROLE_ADMIN" as const,
  createdAt: "2026-08-13T00:00:00.000Z",
};

const createMutate = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: (user: typeof createdUser) => void }) => {
    if (!createError) opts?.onSuccess?.(createdUser);
  },
);
let createError: Error | null = null;
const createReset = vi.fn();

vi.mock("../api/use-create-admin", () => ({
  useCreateAdmin: () => ({
    mutate: createMutate,
    isPending: false,
    error: createError,
    reset: createReset,
  }),
}));

function fillForm({ name = "Иван", email = "ivan@hema.test", password = "s3cret!" } = {}) {
  fireEvent.change(screen.getByLabelText("Имя"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: password } });
}

describe("CreateAdminDialog", () => {
  beforeEach(() => {
    createError = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("success closes the dialog and notifies the parent (AC-10)", () => {
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();
    render(<CreateAdminDialog open onOpenChange={onOpenChange} onCreated={onCreated} />);

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Создать админа" }));

    expect(createMutate).toHaveBeenCalledWith(
      { displayName: "Иван", email: "ivan@hema.test", password: "s3cret!" },
      expect.anything(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreated).toHaveBeenCalledWith(createdUser);
  });

  it("a server error keeps the dialog open with the entered field values still filled in (AC-11)", () => {
    createError = new Error("Email уже занят");
    const onOpenChange = vi.fn();
    render(<CreateAdminDialog open onOpenChange={onOpenChange} />);

    fillForm({ email: "taken@hema.test" });
    fireEvent.click(screen.getByRole("button", { name: "Создать админа" }));

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("Email уже занят")).toBeInTheDocument();
    expect(screen.getByLabelText("Имя")).toHaveValue("Иван");
    expect(screen.getByLabelText("Email")).toHaveValue("taken@hema.test");
    expect(screen.getByLabelText("Пароль")).toHaveValue("s3cret!");
  });

  it("renders inline field validation errors and does not submit (FR-15)", () => {
    render(<CreateAdminDialog open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Создать админа" }));

    expect(screen.getByText("Введите имя")).toBeInTheDocument();
    expect(screen.getByText("Введите email")).toBeInTheDocument();
    expect(screen.getByText("Введите пароль")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("shows an inline error for an invalid email format", () => {
    render(<CreateAdminDialog open onOpenChange={vi.fn()} />);

    fillForm({ email: "not-an-email" });
    fireEvent.click(screen.getByRole("button", { name: "Создать админа" }));

    expect(screen.getByText("Некорректный email")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });
});
