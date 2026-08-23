import { beforeEach, describe, expect, it } from "vitest";
import { useSessionExpiredStore } from "./session-expired-store";

describe("shared/lib/session-expired-store", () => {
  beforeEach(() => {
    useSessionExpiredStore.setState({ isOpen: false, reason: null });
  });

  it("starts closed", () => {
    expect(useSessionExpiredStore.getState().isOpen).toBe(false);
    expect(useSessionExpiredStore.getState().reason).toBeNull();
  });

  it("open(reason) opens with the given reason", () => {
    useSessionExpiredStore.getState().open("query");

    const state = useSessionExpiredStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.reason).toBe("query");
  });

  it("open(reason) accepts a cookie-originated reason", () => {
    useSessionExpiredStore.getState().open("cookie");

    expect(useSessionExpiredStore.getState().reason).toBe("cookie");
  });

  it("close() closes and clears the reason", () => {
    useSessionExpiredStore.getState().open("query");
    useSessionExpiredStore.getState().close();

    const state = useSessionExpiredStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.reason).toBeNull();
  });
});
