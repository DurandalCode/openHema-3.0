// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalPreference } from "./use-local-preference";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

type Appearance = "dark" | "light";

describe("useLocalPreference", () => {
  it("returns the default value when localStorage has nothing for the key", () => {
    const { result } = renderHook(() =>
      useLocalPreference<Appearance>("scoreboard-appearance:arena-1", "dark"),
    );
    expect(result.current[0]).toBe("dark");
  });

  it("reads an existing stored value on mount", () => {
    window.localStorage.setItem("scoreboard-appearance:arena-1", "light");
    const { result } = renderHook(() =>
      useLocalPreference<Appearance>("scoreboard-appearance:arena-1", "dark"),
    );
    expect(result.current[0]).toBe("light");
  });

  it("writes through the setter and persists to localStorage", () => {
    const { result } = renderHook(() =>
      useLocalPreference<Appearance>("scoreboard-appearance:arena-1", "dark"),
    );

    act(() => {
      result.current[1]("light");
    });

    expect(result.current[0]).toBe("light");
    expect(window.localStorage.getItem("scoreboard-appearance:arena-1")).toBe(
      "light",
    );
  });

  it("isolates different keys from each other", () => {
    window.localStorage.setItem("scoreboard-appearance:arena-1", "light");

    const { result: arena1 } = renderHook(() =>
      useLocalPreference<Appearance>("scoreboard-appearance:arena-1", "dark"),
    );
    const { result: arena2 } = renderHook(() =>
      useLocalPreference<Appearance>("scoreboard-appearance:arena-2", "dark"),
    );

    expect(arena1.current[0]).toBe("light");
    expect(arena2.current[0]).toBe("dark");

    act(() => {
      arena2.current[1]("light");
    });

    expect(window.localStorage.getItem("scoreboard-appearance:arena-1")).toBe(
      "light",
    );
    expect(window.localStorage.getItem("scoreboard-appearance:arena-2")).toBe(
      "light",
    );
    expect(arena1.current[0]).toBe("light");
  });

  it("does not throw and keeps the default when localStorage access fails (private mode / SSR polyfill)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("access denied");
    });

    let hookResult: { current: [Appearance, (v: Appearance) => void] } | undefined;
    expect(() => {
      const { result } = renderHook(() =>
        useLocalPreference<Appearance>("scoreboard-appearance:arena-1", "dark"),
      );
      hookResult = result;
    }).not.toThrow();
    expect(hookResult?.current[0]).toBe("dark");
  });
});
