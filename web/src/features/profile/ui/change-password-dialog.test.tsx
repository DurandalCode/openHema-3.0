// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ChangePasswordDialog } from "./change-password-dialog";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

const toastSuccess = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
}));

const changePasswordRequestMock = vi.fn();
vi.mock("@/features/profile/api/requests", () => ({
  changePasswordRequest: (...args: unknown[]) => changePasswordRequestMock(...args),
}));

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <ChangePasswordDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { ...utils, onOpenChange };
}

function fillAndSubmit(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("Новый пароль"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Повторите новый пароль"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "Сменить пароль" }));
}

describe("features/profile/ui/ChangePasswordDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a live PasswordHint under the new-password field as the user types (matches reset-password-form.tsx)", () => {
    renderDialog();

    expect(screen.queryByText(/не меньше 8 символов/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Новый пароль"), { target: { value: "short" } });

    expect(screen.getByText(/не меньше 8 символов/i)).toBeInTheDocument();
  });

  it("blocks submit locally when the new password is shorter than 8 characters", () => {
    renderDialog();

    fillAndSubmit("current1", "short", "short");

    // Сообщение теперь и в живой подсказке под «Новый пароль», и под
    // «Повторите новый пароль» после попытки отправки — оба узла законны.
    expect(screen.getAllByText(/не меньше 8 символов/i).length).toBeGreaterThan(0);
    expect(changePasswordRequestMock).not.toHaveBeenCalled();
  });

  it("blocks submit locally when the confirmation does not match", () => {
    renderDialog();

    fillAndSubmit("current1", "new12345", "different1");

    expect(screen.getByText(/не совпадают/i)).toBeInTheDocument();
    expect(changePasswordRequestMock).not.toHaveBeenCalled();
  });

  it("shows an inline error at the current-password field on a wrong current password (AC-13)", async () => {
    changePasswordRequestMock.mockResolvedValue({ ok: false, error: "неверный текущий пароль" });

    renderDialog();
    fillAndSubmit("wrong0000", "new12345", "new12345");

    expect(await screen.findByText("неверный текущий пароль")).toBeInTheDocument();
  });

  it("on success toasts a warning about other devices and closes (AC-14/FR-25)", async () => {
    changePasswordRequestMock.mockResolvedValue({ ok: true });

    const { onOpenChange } = renderDialog();
    fillAndSubmit("current1", "new12345", "new12345");

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/устройств/i));
  });
});
