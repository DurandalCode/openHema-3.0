// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Спека 0023, T19 (AC-3/AC-4): guard admin-зоны разделяет два случая — гость
// уходит на /login (поведение не меняется), не-админ видит оформленную 403
// вместо молчаливого редиректа на главную (ADR 0007 определяет роль как
// `ROLE_ADMIN`).

const redirectMock = vi.fn((url: string) => {
  // Настоящий next/navigation `redirect` всегда бросает — код после вызова
  // никогда не выполняется. Мок повторяет это, чтобы компонент вёл себя как
  // в проде (см. существующий паттерн в app/dashboard/page.tsx,
  // app/applications/page.tsx — `redirect` без последующего `return`).
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

const getCurrentUserMock = vi.fn();
vi.mock("@/entities/user/model/get-current-user", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

import AdminLayout from "./layout";

describe("app/(admin)/layout.tsx", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("redirects an unauthenticated visitor to /login (AC-4, unchanged behavior)", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    await expect(
      AdminLayout({ children: <div>секретный контент</div> }),
    ).rejects.toThrow("REDIRECT:/login");

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("renders a 403 status page for an authenticated non-admin and does NOT redirect (AC-3)", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "u1",
      email: "user@hema.test",
      displayName: "Боец",
      role: "ROLE_USER",
      createdAt: "",
    });

    const result = await AdminLayout({ children: <div>секретный контент</div> });
    render(result as React.ReactElement);

    expect(screen.getByText("403")).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.queryByText("секретный контент")).not.toBeInTheDocument();
  });

  it("renders children for an admin", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "a1",
      email: "admin@hema.test",
      displayName: "Админ",
      role: "ROLE_ADMIN",
      createdAt: "",
    });

    const result = await AdminLayout({ children: <div>секретный контент</div> });
    render(result as React.ReactElement);

    expect(screen.getByText("секретный контент")).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
