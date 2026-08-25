// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUnsavedGuardStore } from "./unsaved-guard-store";
import { useUnsavedGuard } from "./use-unsaved-guard";

describe("useUnsavedGuard (spec 0039, T19)", () => {
  beforeEach(() => {
    useUnsavedGuardStore.setState({ dirtyReason: null, pendingHref: null });
  });

  afterEach(() => {
    useUnsavedGuardStore.setState({ dirtyReason: null, pendingHref: null });
  });

  it("marks the store dirty with the given reason when isDirty is true", () => {
    renderHook(() => useUnsavedGuard(true, "профиль турнира"));

    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("профиль турнира");
  });

  it("attaches a beforeunload handler that prevents the default action while dirty", () => {
    renderHook(() => useUnsavedGuard(true, "профиль турнира"));

    const event = new Event("beforeunload", { cancelable: true });
    const preventDefault = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
  });

  it("does not mark the store dirty when isDirty is false", () => {
    renderHook(() => useUnsavedGuard(false, "профиль турнира"));

    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();
  });

  it("clears the dirty flag once isDirty flips back to false", () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedGuard(dirty, "профиль турнира"), {
      initialProps: { dirty: true },
    });
    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("профиль турнира");

    rerender({ dirty: false });

    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();
  });

  it("removes the beforeunload handler once clean again", () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedGuard(dirty, "профиль турнира"), {
      initialProps: { dirty: true },
    });
    rerender({ dirty: false });

    const event = new Event("beforeunload", { cancelable: true });
    const preventDefault = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("clears the dirty flag on unmount, even if the screen was dirty", () => {
    const { unmount } = renderHook(() => useUnsavedGuard(true, "профиль турнира"));
    expect(useUnsavedGuardStore.getState().dirtyReason).toBe("профиль турнира");

    unmount();

    expect(useUnsavedGuardStore.getState().dirtyReason).toBeNull();
  });
});
