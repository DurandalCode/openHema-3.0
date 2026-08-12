// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useThemeMock = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => useThemeMock(),
}));

const sonnerToasterSpy = vi.fn();

vi.mock("sonner", () => ({
  Toaster: (props: Record<string, unknown>) => {
    sonnerToasterSpy(props);
    return null;
  },
}));

import { Toaster } from "./sonner";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Toaster (NFR-1)", () => {
  it("берёт тему из next-themes (resolvedTheme = dark)", () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "dark" });

    render(<Toaster />);

    expect(sonnerToasterSpy).toHaveBeenCalledTimes(1);
    const props = sonnerToasterSpy.mock.calls[0]![0] as { theme?: string };
    expect(props.theme).toBe("dark");
  });

  it("берёт тему из next-themes (resolvedTheme = light)", () => {
    useThemeMock.mockReturnValue({ resolvedTheme: "light" });

    render(<Toaster />);

    const props = sonnerToasterSpy.mock.calls[0]![0] as { theme?: string };
    expect(props.theme).toBe("light");
  });

  it("не определяет тему самостоятельно, если next-themes ещё не выдал resolvedTheme", () => {
    useThemeMock.mockReturnValue({ resolvedTheme: undefined });

    render(<Toaster />);

    const props = sonnerToasterSpy.mock.calls[0]![0] as { theme?: string };
    expect(props.theme).toBe("system");
  });
});
