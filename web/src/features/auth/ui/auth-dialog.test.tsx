// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthDialog } from "./auth-dialog";
import { useAuthDialogStore } from "../model/auth-dialog-store";

function renderDialog(props?: { registrationDisabled?: boolean }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthDialog {...props} />
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

const routerPush = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush, replace: vi.fn() }),
  usePathname: () => "/nominations/n1/apply",
}));

vi.mock("../api/requests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/requests")>();
  return {
    ...actual,
    loginRequest: vi.fn(async () => ({ ok: true }) as const),
  };
});

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
    routerPush.mockClear();
    routerRefresh.mockClear();
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

  it("navigates to returnTo after a successful login opened with it (FR-16)", async () => {
    useAuthDialogStore.setState({
      isOpen: true,
      mode: "login",
      returnTo: "/dashboard",
    });
    renderDialog();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ivan@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    await vi.waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith("/dashboard");
    });
    expect(useAuthDialogStore.getState().isOpen).toBe(false);
  });

  it("does not navigate on a plain login without returnTo (FR-1: stays where it was)", async () => {
    useAuthDialogStore.setState({ isOpen: true, mode: "login", returnTo: undefined });
    renderDialog();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ivan@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    await vi.waitFor(() => {
      expect(routerRefresh).toHaveBeenCalled();
    });
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("shows a registration-paused message instead of the form when registrationDisabled is set", () => {
    useAuthDialogStore.setState({ isOpen: true, mode: "register", returnTo: undefined });
    renderDialog({ registrationDisabled: true });

    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByText(/регистрация.*приостановлен/i)).toBeInTheDocument();
  });

  it("still renders the registration form when registrationDisabled is not set (default)", () => {
    useAuthDialogStore.setState({ isOpen: true, mode: "register", returnTo: undefined });
    renderDialog();

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
