// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsCard } from "./notifications-card";
import type { CurrentUser } from "@/entities/user/lib/types";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
  if (!("ResizeObserver" in window)) {
    // @ts-expect-error - минимальный polyfill для jsdom (Checkbox использует radix use-size)
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
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

const updateMutate = vi.fn(
  (_vars: unknown, opts?: { onSuccess?: () => void }) => {
    opts?.onSuccess?.();
  },
);
vi.mock("../api/use-update-notifications", () => ({
  useUpdateNotifications: () => ({ mutate: updateMutate, isPending: false }),
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

describe("features/profile/ui/NotificationsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("verified address: checkboxes are enabled, no explanation shown", () => {
    render(<NotificationsCard user={baseUser({ emailVerified: true })} />);

    expect(screen.getByLabelText("О состоянии моих заявок")).toBeEnabled();
    expect(screen.getByLabelText("О постановке моего пула на площадку")).toBeEnabled();
    expect(screen.queryByText(/подтверждения адреса почты/i)).not.toBeInTheDocument();
  });

  it("unverified address: checkboxes are disabled with an explanation (AC-14)", () => {
    render(<NotificationsCard user={baseUser({ emailVerified: false })} />);

    expect(screen.getByLabelText("О состоянии моих заявок")).toBeDisabled();
    expect(screen.getByLabelText("О постановке моего пула на площадку")).toBeDisabled();
    expect(screen.getByText(/подтверждения адреса почты/i)).toBeInTheDocument();
  });

  it("toggling a checkbox calls the mutation with the updated settings", () => {
    render(
      <NotificationsCard
        user={baseUser({ notifications: { applicationState: false, poolSeated: false } })}
      />,
    );

    fireEvent.click(screen.getByLabelText("О состоянии моих заявок"));

    expect(updateMutate).toHaveBeenCalledWith(
      { applicationState: true, poolSeated: false },
      expect.anything(),
    );
    expect(toastSuccess).toHaveBeenCalled();
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("reflects already-enabled settings as checked", () => {
    render(
      <NotificationsCard
        user={baseUser({ notifications: { applicationState: true, poolSeated: false } })}
      />,
    );

    expect(screen.getByLabelText("О состоянии моих заявок")).toBeChecked();
    expect(screen.getByLabelText("О постановке моего пула на площадку")).not.toBeChecked();
  });
});
