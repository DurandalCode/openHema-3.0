import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
  setSessionCookies: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { changePassword: vi.fn() },
}));

import { authClient } from "@/lib/grpc/client";
import { getAccessToken, setSessionCookies } from "@/lib/session/cookies";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/auth/password route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await POST(req({ currentPassword: "old12345", newPassword: "new12345" }));

    expect(res.status).toBe(401);
    expect(authClient.changePassword).not.toHaveBeenCalled();
  });

  it("calls ChangePassword with the Bearer token and sets new session cookies on success (own session must not break on next refresh)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.changePassword).mockResolvedValue({
      tokens: { accessToken: "new-access", refreshToken: "new-refresh" },
    } as never);

    const res = await POST(req({ currentPassword: "old12345", newPassword: "new12345" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(authClient.changePassword).toHaveBeenCalledWith(
      { currentPassword: "old12345", newPassword: "new12345" },
      { headers: { Authorization: "Bearer tok-xyz" } },
    );
    expect(setSessionCookies).toHaveBeenCalledWith("new-access", "new-refresh");
  });

  it("does not set cookies when the RPC has no tokens in the response", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.changePassword).mockResolvedValue({} as never);

    await POST(req({ currentPassword: "old12345", newPassword: "new12345" }));

    expect(setSessionCookies).not.toHaveBeenCalled();
  });

  it("maps wrong current password (Unauthenticated) to 401 and does not set cookies (AC-9)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.changePassword).mockRejectedValue(
      new ConnectError("invalid credentials", Code.Unauthenticated),
    );

    const res = await POST(req({ currentPassword: "wrong", newPassword: "new12345" }));

    expect(res.status).toBe(401);
    expect(setSessionCookies).not.toHaveBeenCalled();
  });

  it("maps weak new password (InvalidArgument) to 400 (AC-10)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.changePassword).mockRejectedValue(
      new ConnectError("password too short", Code.InvalidArgument),
    );

    const res = await POST(req({ currentPassword: "old12345", newPassword: "short" }));

    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    const badReq = new NextRequest("http://localhost/api/auth/password", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(badReq);

    expect(res.status).toBe(400);
    expect(authClient.changePassword).not.toHaveBeenCalled();
  });
});
