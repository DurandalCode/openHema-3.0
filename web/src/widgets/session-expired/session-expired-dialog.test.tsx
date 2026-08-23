// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionExpiredDialog } from "./session-expired-dialog";
import { useSessionExpiredStore } from "@/shared/lib/session-expired-store";
import { useAuthDialogStore } from "@/features/auth/model/auth-dialog-store";

let pathname = "/nominations/n1";
const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: routerPush }),
}));

let hasAnyDraftMock = vi.fn(() => false);
vi.mock("@/features/my-applications/model/apply-draft", () => ({
  hasAnyDraft: () => hasAnyDraftMock(),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

function clearCookie() {
  document.cookie = "hema_session_expired=; Max-Age=0; path=/";
}

describe("widgets/session-expired/SessionExpiredDialog", () => {
  beforeEach(() => {
    pathname = "/nominations/n1";
    hasAnyDraftMock = vi.fn(() => false);
    routerPush.mockClear();
    clearCookie();
    useSessionExpiredStore.setState({ isOpen: false, reason: null });
    useAuthDialogStore.setState({ isOpen: false, mode: "login", returnTo: undefined });
  });

  afterEach(() => {
    cleanup();
    clearCookie();
  });

  it("stays closed with no cookie marker and no store signal", () => {
    render(<SessionExpiredDialog />);

    expect(screen.queryByRole("heading", { name: "Сессия истекла" })).not.toBeInTheDocument();
  });

  it("opens on mount when the hema_session_expired cookie is present, and clears it", () => {
    document.cookie = "hema_session_expired=1; path=/";

    render(<SessionExpiredDialog />);

    expect(screen.getByRole("heading", { name: "Сессия истекла" })).toBeInTheDocument();
    expect(document.cookie).not.toContain("hema_session_expired=1");
  });

  it("re-checks the cookie on a client-side navigation, not just on the initial mount", () => {
    pathname = "/nominations/n1";
    const { rerender } = render(<SessionExpiredDialog />);
    expect(screen.queryByRole("heading", { name: "Сессия истекла" })).not.toBeInTheDocument();

    // middleware выставляет метку на СЛЕДУЮЩЕЙ soft-навигации, не при первой
    // отрисовке — компонент из корневого layout при этом не перемонтируется.
    document.cookie = "hema_session_expired=1; path=/";
    pathname = "/dashboard";
    rerender(<SessionExpiredDialog />);

    expect(screen.getByRole("heading", { name: "Сессия истекла" })).toBeInTheDocument();
  });

  it("opens when useSessionExpiredStore is opened (UnauthorizedError path)", () => {
    render(<SessionExpiredDialog />);
    expect(screen.queryByRole("heading", { name: "Сессия истекла" })).not.toBeInTheDocument();

    act(() => {
      useSessionExpiredStore.getState().open("query");
    });

    expect(screen.getByRole("heading", { name: "Сессия истекла" })).toBeInTheDocument();
  });

  it("offers 'Продолжить как гость' on a public page, and it just closes the dialog", () => {
    pathname = "/nominations/n1";
    useSessionExpiredStore.setState({ isOpen: true, reason: "query" });
    render(<SessionExpiredDialog />);

    const guestButton = screen.getByRole("button", { name: "Продолжить как гость" });
    fireEvent.click(guestButton);

    expect(useSessionExpiredStore.getState().isOpen).toBe(false);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("offers 'На главную' on a protected page, and it navigates home", () => {
    pathname = "/dashboard";
    useSessionExpiredStore.setState({ isOpen: true, reason: "query" });
    render(<SessionExpiredDialog />);

    expect(
      screen.queryByRole("button", { name: "Продолжить как гость" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "На главную" }));

    expect(routerPush).toHaveBeenCalledWith("/");
    expect(useSessionExpiredStore.getState().isOpen).toBe(false);
  });

  it("treats the admin section as protected too (shared with app/(admin)/layout.tsx's own guard)", () => {
    pathname = "/admin/tournament";
    useSessionExpiredStore.setState({ isOpen: true, reason: "query" });
    render(<SessionExpiredDialog />);

    expect(screen.getByRole("button", { name: "На главную" })).toBeInTheDocument();
  });

  it("treats a nomination apply route as protected too", () => {
    pathname = "/nominations/n1/apply";
    useSessionExpiredStore.setState({ isOpen: true, reason: "query" });
    render(<SessionExpiredDialog />);

    expect(screen.getByRole("button", { name: "На главную" })).toBeInTheDocument();
  });

  it("'Войти снова' opens the auth dialog in login mode with returnTo, and closes itself", () => {
    pathname = "/nominations/n1/apply";
    useSessionExpiredStore.setState({ isOpen: true, reason: "cookie" });
    render(<SessionExpiredDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Войти снова" }));

    expect(useAuthDialogStore.getState()).toMatchObject({
      isOpen: true,
      mode: "login",
      returnTo: "/nominations/n1/apply",
    });
    expect(useSessionExpiredStore.getState().isOpen).toBe(false);
  });

  it("mentions the saved draft only when one exists (FR-20)", () => {
    pathname = "/nominations/n1/apply";
    hasAnyDraftMock = vi.fn(() => true);
    useSessionExpiredStore.setState({ isOpen: true, reason: "query" });
    render(<SessionExpiredDialog />);

    expect(screen.getByText(/черновик/i)).toBeInTheDocument();
  });

  it("does not mention a draft when there isn't one", () => {
    pathname = "/nominations/n1/apply";
    hasAnyDraftMock = vi.fn(() => false);
    useSessionExpiredStore.setState({ isOpen: true, reason: "query" });
    render(<SessionExpiredDialog />);

    expect(screen.queryByText(/черновик/i)).not.toBeInTheDocument();
  });
});
