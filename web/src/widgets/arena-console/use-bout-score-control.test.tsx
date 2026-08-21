// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useBoutScoreControl } from "./use-bout-score-control";

vi.mock("@/shared/lib/toast", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

import { toastError, toastSuccess } from "@/shared/lib/toast";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useBoutScoreControl (спека 0033, FR-19/FR-26/FR-27, AC-8/AC-13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends each step immediately while online", async () => {
    const { result } = renderHook(
      () =>
        useBoutScoreControl({
          arenaId: "a1",
          poolId: "p1",
          boutId: "b1",
          serverScoreA: 3,
          serverScoreB: 2,
          offline: false,
        }),
      { wrapper },
    );

    act(() => result.current.step("A", 1, "красному"));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/pools/p1/bout",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "score", scoreA: 4, scoreB: 2 }),
        }),
      ),
    );
  });

  it("AC-13: collapses three offline steps into one held value, no network calls", () => {
    const { result, rerender } = renderHook(
      (props) => useBoutScoreControl(props),
      {
        wrapper,
        initialProps: {
          arenaId: "a1",
          poolId: "p1",
          boutId: "b1",
          serverScoreA: 0,
          serverScoreB: 0,
          offline: true,
        },
      },
    );

    act(() => result.current.step("A", 1, "красному"));
    rerender({ arenaId: "a1", poolId: "p1", boutId: "b1", serverScoreA: 0, serverScoreB: 0, offline: true });
    act(() => result.current.step("A", 1, "красному"));
    rerender({ arenaId: "a1", poolId: "p1", boutId: "b1", serverScoreA: 0, serverScoreB: 0, offline: true });
    act(() => result.current.step("B", 2, "синему"));

    expect(result.current.scoreA).toBe(2);
    expect(result.current.scoreB).toBe(2);
    expect(result.current.pendingNotice).toBe("Будет отправлен при восстановлении связи");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("AC-13: sends the held value as one absolute request on reconnect, then clears it", async () => {
    const { result, rerender } = renderHook(
      (props) => useBoutScoreControl(props),
      {
        wrapper,
        initialProps: {
          arenaId: "a1",
          poolId: "p1",
          boutId: "b1",
          serverScoreA: 0,
          serverScoreB: 0,
          offline: true,
        },
      },
    );

    act(() => result.current.step("A", 1, "красному"));
    act(() => result.current.step("A", 2, "красному"));
    rerender({ arenaId: "a1", poolId: "p1", boutId: "b1", serverScoreA: 0, serverScoreB: 0, offline: false });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/pools/p1/bout",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "score", scoreA: 3, scoreB: 0 }),
        }),
      ),
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Счёт отправлен"));
    await waitFor(() => expect(result.current.pendingNotice).toBeNull());
  });

  it("keeps the held value and shows an error toast when the reconnect flush fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "конфликт версии" }) } as never);

    const { result, rerender } = renderHook(
      (props) => useBoutScoreControl(props),
      {
        wrapper,
        initialProps: {
          arenaId: "a1",
          poolId: "p1",
          boutId: "b1",
          serverScoreA: 0,
          serverScoreB: 0,
          offline: true,
        },
      },
    );

    act(() => result.current.step("A", 1, "красному"));
    rerender({ arenaId: "a1", poolId: "p1", boutId: "b1", serverScoreA: 0, serverScoreB: 0, offline: false });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("конфликт версии"));
    expect(result.current.pendingNotice).toBe("Будет отправлен при восстановлении связи");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

    it("AC-8: undo reverts to the score before the last step and clears after use", async () => {
    const { result } = renderHook(
      () =>
        useBoutScoreControl({
          arenaId: "a1",
          poolId: "p1",
          boutId: "b1",
          serverScoreA: 4,
          serverScoreB: 6,
          offline: false,
        }),
      { wrapper },
    );

    act(() => result.current.step("A", 1, "красному"));
    expect(result.current.undoLabel).toBe("Отменить +1 красному");

    act(() => result.current.undoLastStep());

    await waitFor(() =>
      expect(global.fetch).toHaveBeenLastCalledWith(
        "/api/pools/p1/bout",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "score", scoreA: 4, scoreB: 6 }),
        }),
      ),
    );
    expect(result.current.undoLabel).toBeNull();
  });

  it("resets undo when the current bout changes", () => {
    const { result, rerender } = renderHook(
      (props) => useBoutScoreControl(props),
      {
        wrapper,
        initialProps: {
          arenaId: "a1",
          poolId: "p1",
          boutId: "b1",
          serverScoreA: 0,
          serverScoreB: 0,
          offline: false,
        },
      },
    );

    act(() => result.current.step("A", 1, "красному"));
    expect(result.current.undoLabel).not.toBeNull();

    rerender({ arenaId: "a1", poolId: "p1", boutId: "b2", serverScoreA: 0, serverScoreB: 0, offline: false });

    expect(result.current.undoLabel).toBeNull();
  });
});
