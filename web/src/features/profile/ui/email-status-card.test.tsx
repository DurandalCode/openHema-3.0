// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EmailStatusCard } from "./email-status-card";
import type { CurrentUser } from "@/entities/user/lib/types";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

const resendMutate = vi.fn();
vi.mock("../api/use-resend-verification", () => ({
  useResendVerification: () => ({ mutate: resendMutate, isPending: false }),
}));

const cancelMutate = vi.fn();
vi.mock("../api/use-cancel-email-change", () => ({
  useCancelEmailChange: () => ({ mutate: cancelMutate, isPending: false }),
}));

vi.mock("../api/use-request-email-change", () => ({
  useRequestEmailChange: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

function baseUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "u1",
    email: "ivan@example.com",
    displayName: "Иван",
    role: "ROLE_USER",
    createdAt: "2026-01-14T00:00:00.000Z",
    club: "",
    emailVerified: true,
    pendingEmail: "",
    notifications: { applicationState: false, poolSeated: false },
    ...overrides,
  };
}

function renderCard(user: CurrentUser) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EmailStatusCard user={user} />
    </QueryClientProvider>,
  );
}

describe("features/profile/ui/EmailStatusCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("verified address: shows the verified badge and no resend button", () => {
    renderCard(baseUser({ emailVerified: true }));

    expect(screen.getByText("подтверждён")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /отправить письмо снова/i })).not.toBeInTheDocument();
  });

  it("unverified address: shows the badge and a resend button that calls the mutation", () => {
    renderCard(baseUser({ emailVerified: false }));

    expect(screen.getByText("не подтверждён")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /отправить письмо снова/i }));

    expect(resendMutate).toHaveBeenCalled();
  });

  it("pending email change: shows the pending address with a cancel button", () => {
    renderCard(baseUser({ pendingEmail: "new@example.com" }));

    expect(screen.getByText(/ожидает подтверждения/i)).toBeInTheDocument();
    expect(screen.getByText("new@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));

    expect(cancelMutate).toHaveBeenCalled();
  });

  it("no pending change: does not show the pending block", () => {
    renderCard(baseUser({ pendingEmail: "" }));

    expect(screen.queryByText(/ожидает подтверждения/i)).not.toBeInTheDocument();
  });

  it("opens the change-email dialog on click", () => {
    renderCard(baseUser());

    fireEvent.click(screen.getByRole("button", { name: "Сменить адрес" }));

    expect(screen.getByText("Сменить адрес почты")).toBeInTheDocument();
  });
});
