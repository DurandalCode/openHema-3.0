import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getRefreshToken: vi.fn(),
  clearSessionCookies: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { logout: vi.fn() },
}));

import { authClient } from "@/lib/grpc/client";
import { clearSessionCookies, getRefreshToken } from "@/lib/session/cookies";
import { POST } from "./route";

describe("app/api/auth/logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the server Logout RPC with the refresh token before clearing cookies (FR-13)", async () => {
    vi.mocked(getRefreshToken).mockResolvedValue("refresh-abc");
    vi.mocked(authClient.logout).mockResolvedValue({} as never);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(authClient.logout).toHaveBeenCalledWith({ refreshToken: "refresh-abc" });
    expect(clearSessionCookies).toHaveBeenCalled();
  });

  it("clears cookies even when the server Logout RPC fails (idempotent logout)", async () => {
    vi.mocked(getRefreshToken).mockResolvedValue("refresh-abc");
    vi.mocked(authClient.logout).mockRejectedValue(new Error("invalid token"));

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(clearSessionCookies).toHaveBeenCalled();
  });

  it("skips the RPC call and just clears cookies when there is no refresh token", async () => {
    vi.mocked(getRefreshToken).mockResolvedValue(undefined);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(authClient.logout).not.toHaveBeenCalled();
    expect(clearSessionCookies).toHaveBeenCalled();
  });
});
