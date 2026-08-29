import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  authClient: { verifyEmail: vi.fn() },
}));

import { authClient } from "@/lib/grpc/client";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/email/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/auth/email/verify route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is public: succeeds without any auth cookie", async () => {
    vi.mocked(authClient.verifyEmail).mockResolvedValue({} as never);

    const res = await POST(req({ token: "tok-abc" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(authClient.verifyEmail).toHaveBeenCalledWith({ token: "tok-abc" });
  });

  it("maps an invalid/expired/used token (InvalidArgument) to 400 (FR-3)", async () => {
    vi.mocked(authClient.verifyEmail).mockRejectedValue(
      new ConnectError("invalid token", Code.InvalidArgument),
    );

    const res = await POST(req({ token: "bad-tok" }));

    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid json", async () => {
    const badReq = new NextRequest("http://localhost/api/auth/email/verify", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(badReq);

    expect(res.status).toBe(400);
    expect(authClient.verifyEmail).not.toHaveBeenCalled();
  });
});
