// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResetRequestForm } from "./reset-request-form";

const mutate = vi.fn((_email: string, opts?: { onSuccess?: () => void }) => {
  opts?.onSuccess?.();
});
let state: { isPending: boolean; error: Error | null } = {
  isPending: false,
  error: null,
};

vi.mock("../api/use-request-password-reset", () => ({
  useRequestPasswordReset: () => ({ mutate, ...state }),
}));

describe("features/auth/ui/ResetRequestForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state = { isPending: false, error: null };
  });

  afterEach(() => {
    cleanup();
  });

  it("submits the entered email to the mutation", () => {
    const setMode = vi.fn();
    render(<ResetRequestForm setMode={setMode} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ivan@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /отправить/i }));

    expect(mutate).toHaveBeenCalledWith(
      "ivan@example.com",
      expect.anything(),
    );
  });

  it("after success shows a persistent confirmation naming the email and 30-minute TTL (AC-4)", () => {
    const setMode = vi.fn();
    render(<ResetRequestForm setMode={setMode} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ivan@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /отправить/i }));

    expect(screen.getByText(/ivan@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/30 минут/)).toBeInTheDocument();
    expect(screen.getByText(/спам/i)).toBeInTheDocument();
    // The form itself is gone — no way to submit twice, no "email not found" wording anywhere.
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByText(/такого email/i)).not.toBeInTheDocument();
  });

  it("has a 'Вернуться ко входу' control that calls setMode('login')", () => {
    const setMode = vi.fn();
    render(<ResetRequestForm setMode={setMode} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Вернуться ко входу/i }),
    );

    expect(setMode).toHaveBeenCalledWith("login");
  });

  it("keeps the 'Вернуться ко входу' control available after success", () => {
    const setMode = vi.fn();
    render(<ResetRequestForm setMode={setMode} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ivan@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /отправить/i }));

    fireEvent.click(
      screen.getByRole("button", { name: /Вернуться ко входу/i }),
    );
    expect(setMode).toHaveBeenCalledWith("login");
  });
});
