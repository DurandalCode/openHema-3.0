import { beforeEach, describe, expect, it } from "vitest";
import { useUnsavedGuardStore } from "./unsaved-guard-store";

describe("shared/lib/unsaved-guard-store (spec 0039, T19)", () => {
  beforeEach(() => {
    useUnsavedGuardStore.setState({ dirtyReason: null, pendingHref: null });
  });

  it("starts clean", () => {
    const state = useUnsavedGuardStore.getState();
    expect(state.dirtyReason).toBeNull();
    expect(state.pendingHref).toBeNull();
  });

  it("setDirty(reason) marks the store dirty with a reason", () => {
    useUnsavedGuardStore.getState().setDirty("профиль турнира");
    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("профиль турнира");
  });

  it("setDirty(null) clears the reason", () => {
    useUnsavedGuardStore.getState().setDirty("профиль турнира");
    useUnsavedGuardStore.getState().setDirty(null);
    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();
  });

  it("request(href) records the intended navigation while dirty", () => {
    useUnsavedGuardStore.getState().setDirty("профиль турнира");
    useUnsavedGuardStore.getState().request("/about");

    expect(useUnsavedGuardStore.getState().pendingHref).toBe("/about");
    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("профиль турнира");
  });

  it("confirm() clears both the reason and the pending navigation (AC-9)", () => {
    useUnsavedGuardStore.getState().setDirty("профиль турнира");
    useUnsavedGuardStore.getState().request("/about");
    useUnsavedGuardStore.getState().confirm();

    const state = useUnsavedGuardStore.getState();
    expect(state.dirtyReason).toBeNull();
    expect(state.pendingHref).toBeNull();
  });

  it("cancel() clears only the pending navigation, keeps dirty (staying on the page)", () => {
    useUnsavedGuardStore.getState().setDirty("профиль турнира");
    useUnsavedGuardStore.getState().request("/about");
    useUnsavedGuardStore.getState().cancel();

    const state = useUnsavedGuardStore.getState();
    expect(state.dirtyReason).toBe("профиль турнира");
    expect(state.pendingHref).toBeNull();
  });
});
