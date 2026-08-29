// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionsCard } from "./sessions-card";
import type { Session } from "@/entities/user/lib/types";

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
});

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

let sessionsResult: { data: Session[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
};
vi.mock("../api/use-sessions", () => ({
  useSessions: () => sessionsResult,
}));

const revokeMutate = vi.fn();
vi.mock("../api/use-revoke-session", () => ({
  useRevokeSession: () => ({ mutate: revokeMutate, isPending: false }),
}));

const revokeOtherMutate = vi.fn(
  (_vars: undefined, opts?: { onSuccess?: (count: number) => void }) => {
    opts?.onSuccess?.(2);
  },
);
vi.mock("../api/use-revoke-other-sessions", () => ({
  useRevokeOtherSessions: () => ({ mutate: revokeOtherMutate, isPending: false }),
}));

function threeSessions(): Session[] {
  return [
    { id: "s1", createdAt: "2026-08-01T00:00:00.000Z", lastSeenAt: "2026-08-27T00:00:00.000Z", current: true },
    { id: "s2", createdAt: "2026-08-10T00:00:00.000Z", lastSeenAt: "2026-08-20T00:00:00.000Z", current: false },
    { id: "s3", createdAt: "2026-08-15T00:00:00.000Z", lastSeenAt: "2026-08-18T00:00:00.000Z", current: false },
  ];
}

describe("features/profile/ui/SessionsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionsResult = { data: [], isLoading: false };
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a loading state while fetching", () => {
    sessionsResult = { data: undefined, isLoading: true };

    render(<SessionsCard />);

    expect(screen.getByText(/загрузка/i)).toBeInTheDocument();
  });

  it("marks the current session and shows no terminate button for it (AC-6)", () => {
    sessionsResult = { data: threeSessions(), isLoading: false };

    render(<SessionsCard />);

    expect(screen.getByText("эта сессия")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Завершить" })).toHaveLength(2);
  });

  it("terminating one session calls the revoke mutation with its id", () => {
    sessionsResult = { data: threeSessions(), isLoading: false };

    render(<SessionsCard />);

    fireEvent.click(screen.getAllByRole("button", { name: "Завершить" })[0]);

    expect(revokeMutate).toHaveBeenCalledWith("s2", expect.anything());
  });

  it("revoke-all-others is disabled when there are no other sessions", () => {
    sessionsResult = {
      data: [{ id: "s1", createdAt: "2026-08-01T00:00:00.000Z", lastSeenAt: "2026-08-27T00:00:00.000Z", current: true }],
      isLoading: false,
    };

    render(<SessionsCard />);

    expect(screen.getByRole("button", { name: /выйти со всех устройств/i })).toBeDisabled();
  });

  it("confirming revoke-all-others calls the mutation (AC-7)", () => {
    sessionsResult = { data: threeSessions(), isLoading: false };

    render(<SessionsCard />);

    fireEvent.click(screen.getByRole("button", { name: /выйти со всех устройств/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Выйти со всех устройств" }));

    expect(revokeOtherMutate).toHaveBeenCalled();
  });

  it("empty list shows an empty-state message", () => {
    sessionsResult = { data: [], isLoading: false };

    render(<SessionsCard />);

    expect(screen.getByText(/нет активных сессий/i)).toBeInTheDocument();
  });
});
