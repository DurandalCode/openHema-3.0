// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { makeQueryClient } from "./query-client";
import { useSessionExpiredStore } from "./session-expired-store";
import { UnauthorizedError } from "@/shared/api/unauthorized";

function wrapperFor(client: ReturnType<typeof makeQueryClient>) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("makeQueryClient", () => {
  beforeEach(() => {
    useSessionExpiredStore.setState({ isOpen: false, reason: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("query path — attempts a silent refresh first (spec 0038, FR-14)", () => {
    it("opens the session-expired store when a query 401s and the silent refresh also fails", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false });
      vi.stubGlobal("fetch", fetchMock);
      const client = makeQueryClient();

      renderHook(
        () =>
          useQuery({
            queryKey: ["unauthorized-probe"],
            queryFn: () => {
              throw new UnauthorizedError();
            },
            retry: false,
          }),
        { wrapper: wrapperFor(client) },
      );

      await waitFor(() => {
        expect(useSessionExpiredStore.getState().isOpen).toBe(true);
      });
      expect(useSessionExpiredStore.getState().reason).toBe("query");
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/refresh", { method: "POST" });
    });

    it("does NOT open the dialog when the silent refresh succeeds and the refetch goes through", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      const client = makeQueryClient();

      // Реалистичная модель: первая попытка ловит протухший access и падает
      // 401, а рефетч (после silent refresh) идёт уже со свежим токеном и
      // проходит — так и выглядело бы в браузере, где queryFn реально ходит
      // в BFF, а не бросает безусловно.
      let calls = 0;
      const { result } = renderHook(
        () =>
          useQuery({
            queryKey: ["unauthorized-probe-2"],
            queryFn: () => {
              calls += 1;
              if (calls === 1) throw new UnauthorizedError();
              return "fresh-data";
            },
            retry: false,
          }),
        { wrapper: wrapperFor(client) },
      );

      await waitFor(() => expect(result.current.data).toBe("fresh-data"));
      expect(useSessionExpiredStore.getState().isOpen).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("opens the dialog if the refresh succeeded but the query still 401s on refetch (guards against looping forever)", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      const client = makeQueryClient();

      renderHook(
        () =>
          useQuery({
            queryKey: ["still-unauthorized-probe"],
            queryFn: () => {
              throw new UnauthorizedError();
            },
            retry: false,
          }),
        { wrapper: wrapperFor(client) },
      );

      await waitFor(() => expect(useSessionExpiredStore.getState().isOpen).toBe(true));
      // Ровно одна попытка продления на этот ключ — не бесконечный цикл
      // invalidate → 401 → invalidate.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("shares a single in-flight refresh across queries that 401 at the same time", async () => {
      let resolveRefresh: (ok: boolean) => void = () => {};
      const fetchMock = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRefresh = (ok: boolean) => resolve({ ok });
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const client = makeQueryClient();

      renderHook(
        () =>
          useQuery({
            queryKey: ["dup-probe-a"],
            queryFn: () => {
              throw new UnauthorizedError();
            },
            retry: false,
          }),
        { wrapper: wrapperFor(client) },
      );
      renderHook(
        () =>
          useQuery({
            queryKey: ["dup-probe-b"],
            queryFn: () => {
              throw new UnauthorizedError();
            },
            retry: false,
          }),
        { wrapper: wrapperFor(client) },
      );

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      resolveRefresh(false);

      await waitFor(() => expect(useSessionExpiredStore.getState().isOpen).toBe(true));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not open the session-expired store on an unrelated query error, and does not attempt a refresh", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const client = makeQueryClient();

      const { result } = renderHook(
        () =>
          useQuery({
            queryKey: ["network-error-probe"],
            queryFn: () => {
              throw new Error("network down");
            },
            retry: false,
          }),
        { wrapper: wrapperFor(client) },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(useSessionExpiredStore.getState().isOpen).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("mutation path — opens the dialog immediately, no silent refresh (spec 0038, AC-10)", () => {
    it("opens the session-expired store when a MUTATION throws UnauthorizedError, without calling refresh", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const client = makeQueryClient();

      const { result } = renderHook(
        () =>
          useMutation({
            mutationFn: async () => {
              throw new UnauthorizedError();
            },
          }),
        { wrapper: wrapperFor(client) },
      );

      result.current.mutate();

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(useSessionExpiredStore.getState().isOpen).toBe(true);
      expect(useSessionExpiredStore.getState().reason).toBe("query");
      // Мутация не повторяется автоматически (риск задвоенной отправки) —
      // поэтому в отличие от query-пути здесь нет попытки silent refresh.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not open the session-expired store on an unrelated mutation error", async () => {
      const client = makeQueryClient();

      const { result } = renderHook(
        () =>
          useMutation({
            mutationFn: async () => {
              throw new Error("boom");
            },
          }),
        { wrapper: wrapperFor(client) },
      );

      result.current.mutate();

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(useSessionExpiredStore.getState().isOpen).toBe(false);
    });
  });
});
