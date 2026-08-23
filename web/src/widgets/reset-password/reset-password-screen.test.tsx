// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordScreen } from "./reset-password-screen";

const mutate = vi.fn(
  (
    _vars: { token: string; password: string },
    opts?: { onSuccess?: () => void; onError?: () => void },
  ) => {
    lastOpts = opts;
  },
);
let lastOpts: { onSuccess?: () => void; onError?: () => void } | undefined;
let state: { isPending: boolean; error: Error | null } = {
  isPending: false,
  error: null,
};

vi.mock("@/features/auth/api/use-reset-password", () => ({
  useResetPassword: () => ({ mutate, ...state }),
}));

function fillForm(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("Новый пароль"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Повторите пароль"), {
    target: { value: confirm },
  });
}

describe("widgets/reset-password/ResetPasswordScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastOpts = undefined;
    state = { isPending: false, error: null };
  });

  afterEach(() => {
    cleanup();
  });

  it("empty token: shows the unified invalid-link message, no password form (AC-7)", () => {
    render(<ResetPasswordScreen token="" />);

    expect(
      screen.getByText(/ссылка недействительна или устарела/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Новый пароль")).not.toBeInTheDocument();
  });

  it("valid token: shows the password + confirm form", () => {
    render(<ResetPasswordScreen token="tok123" />);

    expect(screen.getByLabelText("Новый пароль")).toBeInTheDocument();
    expect(screen.getByLabelText("Повторите пароль")).toBeInTheDocument();
  });

  it("mismatched confirmation: local validation blocks submit, no mutate call (AC)", () => {
    render(<ResetPasswordScreen token="tok123" />);

    fillForm("longenough1", "longenough2");
    fireEvent.click(screen.getByRole("button", { name: /установить пароль/i }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/не совпада/i)).toBeInTheDocument();
  });

  it("password shorter than the minimum: local validation blocks submit (AC-3-like)", () => {
    render(<ResetPasswordScreen token="tok123" />);

    fillForm("short1", "short1");
    fireEvent.click(screen.getByRole("button", { name: /установить пароль/i }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("не меньше 8 символов")).toBeInTheDocument();
  });

  it("successful submit shows a success screen with a login suggestion, no session issued (AC-5)", () => {
    render(<ResetPasswordScreen token="tok123" />);

    fillForm("longenough1", "longenough1");
    fireEvent.click(screen.getByRole("button", { name: /установить пароль/i }));

    expect(mutate).toHaveBeenCalledWith(
      { token: "tok123", password: "longenough1" },
      expect.anything(),
    );

    // simulate the mutation succeeding
    act(() => lastOpts?.onSuccess?.());

    expect(screen.getByText(/пароль (успешно )?изменён|установлен/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /войти/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Новый пароль")).not.toBeInTheDocument();
  });

  it("failed submit (invalid/expired/used token) shows the unified invalid-link message, hides the form (AC-6)", () => {
    render(<ResetPasswordScreen token="tok123" />);

    fillForm("longenough1", "longenough1");
    fireEvent.click(screen.getByRole("button", { name: /установить пароль/i }));

    // simulate the mutation failing (any reason: expired/used/invalid token)
    act(() => lastOpts?.onError?.());

    expect(
      screen.getByText(/ссылка недействительна или устарела/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Новый пароль")).not.toBeInTheDocument();
  });
});
