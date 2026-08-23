// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { makeQueryClient } from "./query-client";
import { useSessionExpiredStore } from "./session-expired-store";
import { UnauthorizedError } from "@/shared/api/unauthorized";

describe("makeQueryClient", () => {
  beforeEach(() => {
    useSessionExpiredStore.setState({ isOpen: false, reason: null });
  });

  it("opens the session-expired store when a query throws UnauthorizedError", async () => {
    const client = makeQueryClient();
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }

    renderHook(
      () =>
        useQuery({
          queryKey: ["unauthorized-probe"],
          queryFn: () => {
            throw new UnauthorizedError();
          },
          retry: false,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(useSessionExpiredStore.getState().isOpen).toBe(true);
    });
    expect(useSessionExpiredStore.getState().reason).toBe("query");
  });

  it("does not open the session-expired store on an unrelated query error", async () => {
    const client = makeQueryClient();
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ["network-error-probe"],
          queryFn: () => {
            throw new Error("network down");
          },
          retry: false,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useSessionExpiredStore.getState().isOpen).toBe(false);
  });
});
