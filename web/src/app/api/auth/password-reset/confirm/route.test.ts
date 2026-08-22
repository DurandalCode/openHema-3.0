import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  authClient: { resetPassword: vi.fn() },
}));

import { authClient } from "@/lib/grpc/client";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/password-reset/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/auth/password-reset/confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 {ok:true} on a valid token + password", async () => {
    vi.mocked(authClient.resetPassword).mockResolvedValue({} as never);

    const res = await POST(req({ token: "raw-token", password: "newpassword1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(authClient.resetPassword).toHaveBeenCalledWith({
      token: "raw-token",
      newPassword: "newpassword1",
    });
  });

  it("maps ConnectError InvalidArgument to 400 with human text (AC-4/AC-5/AC-8)", async () => {
    vi.mocked(authClient.resetPassword).mockRejectedValue(
      new ConnectError("invalid token", Code.InvalidArgument),
    );

    const res = await POST(req({ token: "expired", password: "newpassword1" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "ссылка недействительна или устарела",
    });
  });

  it("maps other ConnectError codes via errorResponse (e.g. Internal → 500)", async () => {
    vi.mocked(authClient.resetPassword).mockRejectedValue(
      new ConnectError("boom", Code.Internal),
    );

    const res = await POST(req({ token: "t", password: "newpassword1" }));

    expect(res.status).toBe(500);
  });

  it("returns 400 on invalid json", async () => {
    const badReq = new NextRequest("http://localhost/api/auth/password-reset/confirm", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(badReq);

    expect(res.status).toBe(400);
    expect(authClient.resetPassword).not.toHaveBeenCalled();
  });
});
