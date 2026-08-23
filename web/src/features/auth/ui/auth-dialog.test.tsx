// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthDialog } from "./auth-dialog";
import { useAuthDialogStore } from "../model/auth-dialog-store";

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthDialog />
    </QueryClientProvider>,
  );
}

/**
 * Radix `Dialog`/`Tabs` в jsdom требуют pointer-capture/scrollIntoView
 * полифиллов (см. shared/ui/dialog.test.tsx).
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("./reset-request-form", () => ({
  ResetRequestForm: ({ setMode }: { setMode: (m: string) => void }) => (
    <div data-testid="reset-request-form-stub">
      <button type="button" onClick={() => setMode("login")}>
        stub-back-to-login
      </button>
    </div>
  ),
}));

describe("features/auth/ui/AuthDialog", () => {
  beforeEach(() => {
    useAuthDialogStore.setState({ isOpen: true, mode: "login", returnTo: undefined });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows two tabs, Вход и Регистрация, in login/register modes (FR-2)", () => {
    renderDialog();

    expect(screen.getByRole("tab", { name: "Вход" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Регистрация" })).toBeInTheDocument();
  });

  it("switching to the Регистрация tab updates the store mode", () => {
    renderDialog();

    const tab = screen.getByRole("tab", { name: "Регистрация" });
    fireEvent.mouseDown(tab, { button: 0 });

    expect(useAuthDialogStore.getState().mode).toBe("register");
  });

  it("'Забыли пароль?' switches to reset mode and hides the tabs (FR-2)", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /Забыли пароль\?/i }));

    expect(useAuthDialogStore.getState().mode).toBe("reset");
  });

  it("reset mode renders ResetRequestForm and no tabs", () => {
    useAuthDialogStore.setState({ isOpen: true, mode: "reset", returnTo: undefined });
    renderDialog();

    expect(screen.getByTestId("reset-request-form-stub")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Вход" })).not.toBeInTheDocument();
  });

  it("returning from reset mode (via ResetRequestForm's setMode) goes back to login", () => {
    useAuthDialogStore.setState({ isOpen: true, mode: "reset", returnTo: undefined });
    renderDialog();

    fireEvent.click(screen.getByText("stub-back-to-login"));

    expect(useAuthDialogStore.getState().mode).toBe("login");
  });

  it("reset mode has its own title distinct from login/register", () => {
    useAuthDialogStore.setState({ isOpen: true, mode: "reset", returnTo: undefined });
    renderDialog();

    expect(
      screen.getByRole("heading", { name: /восстановление пароля/i }),
    ).toBeInTheDocument();
  });
});
