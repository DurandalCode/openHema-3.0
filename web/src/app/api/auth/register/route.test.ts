import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  authClient: { register: vi.fn() },
}));
vi.mock("@/lib/session/cookies", () => ({
  setSessionCookies: vi.fn(),
}));
vi.mock("@/lib/grpc/serialize", () => ({
  userToJson: vi.fn((u) => u),
}));
vi.mock("@/shared/config/preprod", () => ({
  isPreprodModeEnabled: vi.fn(() => false),
  isRegistrationDisabled: vi.fn(() => false),
}));

import { authClient } from "@/lib/grpc/client";
import { isPreprodModeEnabled, isRegistrationDisabled } from "@/shared/config/preprod";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/auth/register route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPreprodModeEnabled).mockReturnValue(false);
    vi.mocked(isRegistrationDisabled).mockReturnValue(false);
  });

  it("registers and returns {user} when both gates are off (happy path)", async () => {
    vi.mocked(authClient.register).mockResolvedValue({
      user: { id: "u1", displayName: "Иван" },
      tokens: undefined,
    } as never);

    const res = await POST(
      req({ email: "ivan@example.com", password: "password123", displayName: "Иван" }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ user: { id: "u1", displayName: "Иван" } });
    expect(authClient.register).toHaveBeenCalledWith({
      email: "ivan@example.com",
      password: "password123",
      displayName: "Иван",
    });
  });

  it("returns 403 and skips Register when registration is disabled", async () => {
    vi.mocked(isRegistrationDisabled).mockReturnValue(true);

    const res = await POST(
      req({ email: "ivan@example.com", password: "password123", displayName: "Иван" }),
    );

    expect(res.status).toBe(403);
    expect(authClient.register).not.toHaveBeenCalled();
  });

  it("returns 403 and skips Register when preprod mode is enabled (FR-4)", async () => {
    vi.mocked(isPreprodModeEnabled).mockReturnValue(true);

    const res = await POST(
      req({ email: "ivan@example.com", password: "password123", displayName: "Иван" }),
    );

    expect(res.status).toBe(403);
    expect(authClient.register).not.toHaveBeenCalled();
  });
});
